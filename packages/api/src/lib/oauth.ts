// OAuth code-exchange + userinfo lookup for GitHub + Google.

export type Provider = "github" | "google";

export interface UserInfo {
  providerSub: string;
  email: string;
  name: string | null;
}

interface ProviderConfig {
  tokenUrl: string;
  authorizeUrl: string;
  defaultScope: string;
}

const PROVIDERS: Record<Provider, ProviderConfig> = {
  github: {
    tokenUrl: "https://github.com/login/oauth/access_token",
    authorizeUrl: "https://github.com/login/oauth/authorize",
    defaultScope: "user:email read:user",
  },
  google: {
    tokenUrl: "https://oauth2.googleapis.com/token",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    defaultScope: "openid email profile",
  },
};

export function authorizeUrl(
  provider: Provider,
  clientId: string,
  state: string,
  redirectUri: string,
): string {
  const cfg = PROVIDERS[provider];
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: cfg.defaultScope,
    state,
  });
  return `${cfg.authorizeUrl}?${params.toString()}`;
}

export async function exchangeCode(
  provider: Provider,
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
): Promise<string> {
  const cfg = PROVIDERS[provider];
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`oauth ${provider} token exchange failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token?: string; error?: string };
  if (!json.access_token) {
    throw new Error(`oauth ${provider} no access_token: ${JSON.stringify(json)}`);
  }
  return json.access_token;
}

export async function fetchUserInfo(provider: Provider, accessToken: string): Promise<UserInfo> {
  if (provider === "github") {
    return fetchGithubUserInfo(accessToken);
  }
  return fetchGoogleUserInfo(accessToken);
}

async function fetchGithubUserInfo(accessToken: string): Promise<UserInfo> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "basalt-api",
  };
  const userRes = await fetch("https://api.github.com/user", { headers });
  if (!userRes.ok) throw new Error(`github /user failed: ${userRes.status}`);
  const user = (await userRes.json()) as {
    id: number;
    login: string;
    name: string | null;
    email: string | null;
  };
  let email = user.email;
  if (!email) {
    // GitHub may hide primary email — fetch /user/emails which respects the
    // user:email scope and returns all verified addresses.
    const emailsRes = await fetch("https://api.github.com/user/emails", { headers });
    if (emailsRes.ok) {
      const emails = (await emailsRes.json()) as Array<{
        email: string;
        primary: boolean;
        verified: boolean;
      }>;
      const primary = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified);
      email = primary?.email ?? null;
    }
  }
  if (!email) throw new Error("github: no verified email available");
  return {
    providerSub: String(user.id),
    email,
    name: user.name ?? user.login,
  };
}

async function fetchGoogleUserInfo(accessToken: string): Promise<UserInfo> {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`google /userinfo failed: ${res.status}`);
  const info = (await res.json()) as {
    sub: string;
    email: string;
    email_verified: boolean;
    name?: string;
  };
  if (!info.email_verified) throw new Error("google: email not verified");
  return {
    providerSub: info.sub,
    email: info.email,
    name: info.name ?? null,
  };
}
