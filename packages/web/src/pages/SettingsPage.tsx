import { useQuery } from "@tanstack/react-query";

interface Me {
  id: string;
  email: string;
  tier: "free" | "pro" | "founder";
}

export function SettingsPage() {
  const { data, isLoading, error } = useQuery<Me>({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await fetch("/v1/me", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });
  return (
    <section className="max-w-3xl mx-auto px-6 py-16">
      <p className="mono text-basalt-ink-dim uppercase tracking-widest text-xs">IV</p>
      <h1 className="text-4xl font-display mt-2 mb-6">Settings</h1>
      {isLoading && <p className="text-basalt-ink-dim">Loading…</p>}
      {error && (
        <p className="text-basalt-danger">
          Not signed in. (Sign in once OAuth apps are configured server-side.)
        </p>
      )}
      {data && (
        <div className="space-y-4">
          <p>
            <span className="mono text-basalt-ink-dim">email</span>{" "}
            <span className="text-basalt-ink">{data.email}</span>
          </p>
          <p>
            <span className="mono text-basalt-ink-dim">tier</span>{" "}
            <span className="text-basalt-accent-na font-semibold">{data.tier}</span>
          </p>
          {data.tier === "free" && (
            <button
              type="button"
              onClick={async () => {
                const res = await fetch("/v1/billing/checkout", {
                  method: "POST",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    plan: "pro",
                    success_url: window.location.origin + "/settings?upgraded=1",
                    cancel_url: window.location.origin + "/settings",
                  }),
                });
                const body = (await res.json()) as { url?: string; error?: string };
                if (body.url) window.location.assign(body.url);
                else alert(`Checkout: ${body.error ?? "failed"}`);
              }}
              className="mono bg-basalt-accent-na text-basalt-bg px-4 py-2"
            >
              Upgrade to Pro
            </button>
          )}
        </div>
      )}
    </section>
  );
}
