import { describe, expect, it } from "vitest";
import { buildSessionCookie, clearSessionCookie, newSessionToken } from "./session";

describe("session helpers", () => {
  it("newSessionToken returns base64url-safe high-entropy strings", () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const t = newSessionToken();
      expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(t.length).toBeGreaterThanOrEqual(40);
      tokens.add(t);
    }
    expect(tokens.size).toBe(100);
  });

  it("buildSessionCookie produces HttpOnly cookie with Max-Age", () => {
    const c = buildSessionCookie("abc", { secure: true });
    expect(c).toContain("basalt_session=abc");
    expect(c).toContain("HttpOnly");
    expect(c).toContain("Path=/");
    expect(c).toContain("SameSite=Lax");
    expect(c).toContain("Secure");
    expect(c).toContain("Max-Age=");
  });

  it("buildSessionCookie omits Secure in non-production environments", () => {
    const c = buildSessionCookie("abc", { secure: false });
    expect(c).not.toContain("Secure");
  });

  it("clearSessionCookie produces a Max-Age=0 cookie", () => {
    const c = clearSessionCookie();
    expect(c).toContain("Max-Age=0");
    expect(c).toContain("basalt_session=;");
  });
});
