import { describe, expect, it } from "vitest";
import { decryptKey, encryptKey, isByokProvider, kvKey } from "./byok";

const SECRET = "this-is-a-32-byte-master-secret!"; // 32 bytes

describe("byok envelope crypto", () => {
  it("round-trips a key through encrypt + decrypt", async () => {
    const plain = "sk-test-1234567890abcdef";
    const env = await encryptKey(plain, SECRET);
    expect(env).toContain(":");
    const back = await decryptKey(env, SECRET);
    expect(back).toBe(plain);
  });

  it("produces a different ciphertext on every encrypt (IV is random)", async () => {
    const a = await encryptKey("sk-1", SECRET);
    const b = await encryptKey("sk-1", SECRET);
    expect(a).not.toBe(b);
  });

  it("fails to decrypt with the wrong secret", async () => {
    const env = await encryptKey("sk-1", SECRET);
    await expect(decryptKey(env, "wrong-secret-padded-to-32-bytes!!")).rejects.toBeTruthy();
  });

  it("rejects malformed envelopes", async () => {
    await expect(decryptKey("not-an-envelope", SECRET)).rejects.toThrow();
  });
});

describe("byok helpers", () => {
  it("isByokProvider recognizes the three providers", () => {
    expect(isByokProvider("openai")).toBe(true);
    expect(isByokProvider("anthropic")).toBe(true);
    expect(isByokProvider("google")).toBe(true);
    expect(isByokProvider("groq")).toBe(false);
    expect(isByokProvider("")).toBe(false);
  });

  it("kvKey builds a unique per-user-per-provider key", () => {
    expect(kvKey("u1", "openai")).toBe("byok:u1:openai");
    expect(kvKey("u2", "anthropic")).toBe("byok:u2:anthropic");
  });
});
