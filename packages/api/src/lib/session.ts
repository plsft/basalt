// Session cookie helpers. Sessions are stored in KV under `session:<token>`
// keyed by an opaque random token. The cookie is HttpOnly + Secure +
// SameSite=Lax + 30-day TTL.

const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface SessionPayload {
  userId: string;
  createdAt: number;
}

export function newSessionToken(): string {
  // 32 random bytes → base64url. ~256 bits of entropy.
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function buildSessionCookie(token: string, opts: { secure: boolean }): string {
  const parts = [
    `basalt_session=${token}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie(): string {
  return "basalt_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0; Secure";
}

export { SESSION_TTL_SECONDS };
