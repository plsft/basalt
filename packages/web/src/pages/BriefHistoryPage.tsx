import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

interface BriefSummary {
  id: string;
  vault_id: string;
  section: string;
  created_at: string;
}

export function BriefHistoryPage() {
  const { data, isLoading, error } = useQuery<{ briefs: BriefSummary[] }>({
    queryKey: ["briefs"],
    queryFn: async () => {
      const res = await fetch("/v1/briefs?limit=20", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  return (
    <section className="max-w-3xl mx-auto px-6 py-16">
      <p className="mono text-basalt-ink-dim uppercase tracking-widest text-xs">I</p>
      <h1 className="text-4xl font-display mt-2 mb-6">Briefs</h1>
      {isLoading && <p className="text-basalt-ink-dim">Loading…</p>}
      {error && (
        <p className="text-basalt-danger">
          Sign in to see briefs. (API: {(error as Error).message})
        </p>
      )}
      <ul className="space-y-3 mt-8">
        {data?.briefs?.map((b) => (
          <li key={b.id} className="border-b border-basalt-rule pb-3">
            <Link
              to={`/briefs/${b.id}`}
              className="block hover:bg-basalt-bg-raised -mx-2 px-2 py-2"
            >
              <span className="mono text-basalt-accent-na">{b.section}</span>
              <span className="ml-3 text-basalt-ink-dim mono text-sm">{b.created_at}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
