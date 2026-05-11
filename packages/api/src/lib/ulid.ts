// Crockford-base32 ULID. 26 chars, sortable by leading timestamp.
// 48-bit timestamp + 80-bit randomness; runs on the Workers runtime without
// any deps.

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encodeTime(now: number): string {
  let t = Math.max(0, Math.floor(now));
  const out: string[] = [];
  for (let i = 0; i < 10; i++) {
    const mod = t % 32;
    out.push(ALPHABET[mod] ?? "0");
    t = (t - mod) / 32;
  }
  return out.reverse().join("");
}

function encodeRandom(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  const out: string[] = [];
  // Pack the 80 random bits into 16 base-32 chars, 5 bits per char.
  let bits = 0;
  let bitCount = 0;
  for (const b of bytes) {
    bits = (bits << 8) | b;
    bitCount += 8;
    while (bitCount >= 5) {
      bitCount -= 5;
      const idx = (bits >> bitCount) & 0x1f;
      out.push(ALPHABET[idx] ?? "0");
    }
  }
  return out.join("").slice(0, 16);
}

export function ulid(now: number = Date.now()): string {
  return `${encodeTime(now)}${encodeRandom()}`;
}
