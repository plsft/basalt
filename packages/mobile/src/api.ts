// Mobile API client. Reads `apiUrl` + `apiToken` from localStorage; both
// are configured via the Settings page. All fetches send the session
// cookie via the `Cookie` header (we can't set HttpOnly cookies from a
// foreign origin, so the user pastes the token from their web cockpit's
// dev tools — same pattern as the Desktop app).

export interface Brief {
  id: string;
  vault_id: string;
  section: string;
  created_at: string;
  brief?: unknown;
}

export interface BriefRow {
  id: string;
  vault_id: string;
  section: string;
  created_at: string;
}

const KEY = "basalt:mobile-settings:v1";

export interface MobileSettings {
  apiUrl: string;
  apiToken: string;
}

export function loadSettings(): MobileSettings {
  if (typeof localStorage === "undefined") return { apiUrl: "", apiToken: "" };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { apiUrl: "https://api.basalt.dev", apiToken: "" };
    return { apiUrl: "https://api.basalt.dev", apiToken: "", ...JSON.parse(raw) };
  } catch {
    return { apiUrl: "https://api.basalt.dev", apiToken: "" };
  }
}

export function saveSettings(s: MobileSettings): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(s));
}

export interface ApiError extends Error {
  status: number;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { apiUrl, apiToken } = loadSettings();
  if (!apiUrl) throw new Error("API URL not configured. Open Settings.");
  if (!apiToken) {
    const err = new Error("Sign in required.") as ApiError;
    err.status = 401;
    throw err;
  }
  const url = `${apiUrl.replace(/\/$/, "")}${path}`;
  const headers = new Headers(init.headers);
  headers.set("cookie", `basalt_session=${apiToken}`);
  if (!headers.has("content-type") && init.body) headers.set("content-type", "application/json");
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}: ${await res.text()}`) as ApiError;
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as T;
}

export async function listBriefs(): Promise<{ briefs: BriefRow[] }> {
  return call<{ briefs: BriefRow[] }>("/v1/briefs?limit=20");
}

export async function getBrief(id: string): Promise<Brief> {
  return call<Brief>(`/v1/briefs/${encodeURIComponent(id)}`);
}

export async function whoami(): Promise<{ id: string; email: string; tier: string }> {
  return call("/v1/me");
}
