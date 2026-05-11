// Stripe webhook signature verification (HMAC-SHA256 over `timestamp.body`)
// using the Workers SubtleCrypto API. No SDK — keeps the bundle small.
//
// Reference: https://stripe.com/docs/webhooks/signatures

export interface StripeSignatureHeader {
  /** Unix seconds. Stripe rejects signatures > 5min skewed by default. */
  timestamp: number;
  /** All v1 signature values from the header. */
  v1: string[];
}

const FIVE_MINUTES_SECONDS = 5 * 60;

export function parseSignatureHeader(
  header: string | null | undefined,
): StripeSignatureHeader | null {
  if (!header) return null;
  const parts = header.split(",");
  let timestamp: number | null = null;
  const v1: string[] = [];
  for (const part of parts) {
    const [k, v] = part.split("=", 2);
    if (!k || !v) continue;
    if (k === "t") timestamp = Number.parseInt(v, 10);
    else if (k === "v1") v1.push(v);
  }
  if (timestamp === null || Number.isNaN(timestamp) || v1.length === 0) return null;
  return { timestamp, v1 };
}

/** HMAC-SHA256 hex string of `timestamp.body`. */
async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time comparison to avoid timing leaks. */
function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Verify a Stripe webhook. Returns the parsed event JSON if valid. */
export async function verifyStripeWebhook(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string,
  toleranceSeconds: number = FIVE_MINUTES_SECONDS,
): Promise<{ ok: true; event: StripeEvent } | { ok: false; reason: string }> {
  const parsed = parseSignatureHeader(signatureHeader);
  if (!parsed) return { ok: false, reason: "missing_or_malformed_signature" };
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parsed.timestamp) > toleranceSeconds) {
    return { ok: false, reason: "timestamp_out_of_tolerance" };
  }
  const expected = await hmacHex(secret, `${parsed.timestamp}.${rawBody}`);
  const matched = parsed.v1.some((s) => constantTimeEq(s, expected));
  if (!matched) return { ok: false, reason: "signature_mismatch" };
  try {
    const event = JSON.parse(rawBody) as StripeEvent;
    return { ok: true, event };
  } catch {
    return { ok: false, reason: "body_not_json" };
  }
}

export interface StripeEvent {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
  created: number;
  livemode: boolean;
}

/** Narrowed shape for the few event types we handle. */
export interface CheckoutSessionCompleted {
  id: string;
  client_reference_id: string | null;
  customer: string | null;
  customer_email: string | null;
  subscription: string | null;
  mode: "subscription" | "payment" | "setup";
  payment_status: "paid" | "unpaid" | "no_payment_required";
  metadata: Record<string, string> | null;
}

export interface StripeSubscription {
  id: string;
  customer: string;
  status:
    | "active"
    | "past_due"
    | "unpaid"
    | "canceled"
    | "incomplete"
    | "incomplete_expired"
    | "trialing"
    | "paused";
  current_period_end: number;
  items: { data: Array<{ price: { id: string } }> };
  metadata: Record<string, string> | null;
}
