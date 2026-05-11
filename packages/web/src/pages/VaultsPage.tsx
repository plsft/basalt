import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

interface Vault {
  id: string;
  name: string;
  sync_enabled: number;
  created_at: string;
}

export function VaultsPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const { data, isLoading } = useQuery<{ vaults: Vault[] }>({
    queryKey: ["vaults"],
    queryFn: async () => {
      const res = await fetch("/v1/vaults", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });
  const create = useMutation({
    mutationFn: async (vaultName: string) => {
      const res = await fetch("/v1/vaults", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: vaultName }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["vaults"] });
      setName("");
    },
  });
  return (
    <section className="max-w-3xl mx-auto px-6 py-16">
      <p className="mono text-basalt-ink-dim uppercase tracking-widest text-xs">III</p>
      <h1 className="text-4xl font-display mt-2 mb-6">Vaults</h1>
      <form
        className="flex gap-2 mb-8"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate(name.trim());
        }}
      >
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New vault name…"
          className="flex-1 bg-basalt-bg-raised border border-basalt-rule text-basalt-ink px-3 py-2 mono"
        />
        <button
          type="submit"
          disabled={create.isPending}
          className="mono bg-basalt-accent-na text-basalt-bg px-4 py-2 disabled:opacity-50"
        >
          Add
        </button>
      </form>
      {isLoading && <p className="text-basalt-ink-dim">Loading…</p>}
      <ul className="space-y-2">
        {data?.vaults?.map((v) => (
          <li key={v.id} className="border-b border-basalt-rule pb-2 mono">
            <span className="text-basalt-ink">{v.name}</span>
            <span className="ml-3 text-basalt-ink-dim text-xs">{v.id.slice(0, 8)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
