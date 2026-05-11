// Unit tests for the Stripe signature verifier. No SDK; verifies the raw
// HMAC-SHA256(timestamp.body, secret) path Stripe documents.

import { describe, expect, it } from "vitest";
import { parseSignatureHeader, verifyStripeWebhook } from "./stripe";

const SECRET = "whsec_test_super_secret";

async function sign(body: string, ts: number, secret: string = SECRET): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}.${body}`));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("parseSignatureHeader", () => {
  it("parses t and v1 values", () => {
    const h = parseSignatureHeader("t=1700000000,v1=abc123,v1=deadbeef,v0=ignored");
    expect(h).not.toBeNull();
    expect(h?.timestamp).toBe(1700000000);
    expect(h?.v1).toEqual(["abc123", "deadbeef"]);
  });
  it("returns null for missing timestamp", () => {
    expect(parseSignatureHeader("v1=abc")).toBeNull();
  });
  it("returns null for missing v1", () => {
    expect(parseSignatureHeader("t=1700000000")).toBeNull();
  });
  it("returns null for null/empty input", () => {
    expect(parseSignatureHeader(null)).toBeNull();
    expect(parseSignatureHeader("")).toBeNull();
  });
});

describe("verifyStripeWebhook", () => {
  const body =
    '{"id":"evt_1","type":"checkout.session.completed","data":{"object":{}},"created":1700000000,"livemode":false}';

  it("verifies a valid signature within tolerance", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const sig = await sign(body, ts);
    const res = await verifyStripeWebhook(body, `t=${ts},v1=${sig}`, SECRET);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.event.id).toBe("evt_1");
      expect(res.event.type).toBe("checkout.session.completed");
    }
  });

  it("rejects when signature uses wrong secret", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const sig = await sign(body, ts, "whsec_wrong");
    const res = await verifyStripeWebhook(body, `t=${ts},v1=${sig}`, SECRET);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("signature_mismatch");
  });

  it("rejects when body has been tampered", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const sig = await sign(body, ts);
    const tampered = body.replace("evt_1", "evt_2");
    const res = await verifyStripeWebhook(tampered, `t=${ts},v1=${sig}`, SECRET);
    expect(res.ok).toBe(false);
  });

  it("rejects timestamps outside the 5-minute window", async () => {
    const ts = Math.floor(Date.now() / 1000) - 600; // 10 min ago
    const sig = await sign(body, ts);
    const res = await verifyStripeWebhook(body, `t=${ts},v1=${sig}`, SECRET);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("timestamp_out_of_tolerance");
  });

  it("rejects missing header", async () => {
    const res = await verifyStripeWebhook(body, null, SECRET);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("missing_or_malformed_signature");
  });

  it("accepts when at least one v1 signature is valid (rotation)", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const goodSig = await sign(body, ts);
    const header = `t=${ts},v1=deadbeefdeadbeef,v1=${goodSig}`;
    const res = await verifyStripeWebhook(body, header, SECRET);
    expect(res.ok).toBe(true);
  });

  it("rejects non-JSON body even when signature checks out", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const garbage = "not-json-but-signed";
    const sig = await sign(garbage, ts);
    const res = await verifyStripeWebhook(garbage, `t=${ts},v1=${sig}`, SECRET);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("body_not_json");
  });
});
