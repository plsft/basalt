import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";

interface BriefRow {
  id: string;
  vault_id: string;
  section: string;
  created_at: string;
  brief: unknown;
}

export function BriefPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery<BriefRow>({
    queryKey: ["brief", id],
    queryFn: async () => {
      const res = await fetch(`/v1/briefs/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: !!id,
  });
  return (
    <section className="max-w-3xl mx-auto px-6 py-16">
      <p className="mono text-basalt-ink-dim uppercase tracking-widest text-xs">I · Brief</p>
      <h1 className="text-3xl font-display mt-2 mb-6">{id}</h1>
      {isLoading && <p className="text-basalt-ink-dim">Loading…</p>}
      {error && <p className="text-basalt-danger">{(error as Error).message}</p>}
      {data && (
        <pre className="mono text-xs text-basalt-ink-dim overflow-x-auto p-4 bg-basalt-bg-raised">
          {JSON.stringify(data.brief, null, 2)}
        </pre>
      )}
    </section>
  );
}
