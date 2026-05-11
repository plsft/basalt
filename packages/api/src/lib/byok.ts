// BYOK (bring-your-own-key) storage. Per-user provider API keys are
// stored in the BYOK_KEYS KV namespace, encrypted at rest with AES-GCM
// using BYOK_ENCRYPTION_KEY (a wrangler secret).
//
// On rotation: re-encrypt all keys with the new master key via a one-off
// migration script (out of scope here — store the master key in 1Password
// and don't rotate it casually).

export type ByokProvider = "openai" | "anthropic" | "google";

const ALL_PROVIDERS: readonly ByokProvider[] = ["openai", "anthropic", "google"] as const;

export function isByokProvider(s: string): s is ByokProvider {
  return (ALL_PROVIDERS as readonly string[]).includes(s);
}

function masterKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret).slice(0, 32),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Encrypts a plaintext API key. Output format: `base64(iv) || ":" || base64(ciphertext)`. */
export async function encryptKey(plaintext: string, secret: string): Promise<string> {
  const key = await masterKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return `${toB64(iv)}:${toB64(new Uint8Array(ct))}`;
}

export async function decryptKey(envelope: string, secret: string): Promise<string> {
  const [ivB64, ctB64] = envelope.split(":", 2);
  if (!ivB64 || !ctB64) throw new Error("byok: malformed envelope");
  const iv = fromB64(ivB64);
  const ct = fromB64(ctB64);
  const key = await masterKey(secret);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64(b64: string): Uint8Array {
  let s = b64.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4 !== 0) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function kvKey(userId: string, provider: ByokProvider): string {
  return `byok:${userId}:${provider}`;
}

export { ALL_PROVIDERS };
