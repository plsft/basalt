// `basalt search` — cross-vault semantic search via the hosted API.
// Local-only search lives behind `basalt brief --section connection` already;
// this command targets users who've pushed snapshots for multiple vaults.

import kleur from "kleur";
import { loadConfig } from "../config";

export interface SearchOptions {
  query: string;
  vaultIds?: string[];
  top?: number;
  apiUrl?: string;
  apiToken?: string;
  json?: boolean;
}

interface SearchResponse {
  query: string;
  elapsed_ms: number;
  embedding_model: string;
  hits: Array<{
    vault_id: string;
    rel_path: string;
    title: string;
    updated: string | null;
    score: number;
  }>;
}

export async function searchCommand(opts: SearchOptions): Promise<void> {
  const cfg = loadConfig();
  const apiUrl = opts.apiUrl ?? cfg.apiUrl;
  const apiToken = opts.apiToken ?? cfg.apiToken ?? process.env.BASALT_API_TOKEN ?? "";
  if (!apiToken) {
    throw new Error(
      "No API token. Set apiToken in ~/.basalt/config.toml or pass --api-token / BASALT_API_TOKEN.",
    );
  }
  const top = opts.top ?? 10;
  const body: Record<string, unknown> = { query: opts.query, top };
  if (opts.vaultIds && opts.vaultIds.length > 0) body.vault_ids = opts.vaultIds;

  const url = `${apiUrl.replace(/\/$/, "")}/v1/search`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: `basalt_session=${apiToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Search failed: HTTP ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as SearchResponse;
  if (opts.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  console.log(
    kleur.dim(`${data.hits.length} hit(s) in ${data.elapsed_ms}ms · model ${data.embedding_model}`),
  );
  for (const h of data.hits) {
    const scoreStr = h.score.toFixed(3);
    console.log(
      `  ${kleur.green(scoreStr.padStart(6))}  ${kleur.dim(`[${h.vault_id.slice(0, 8)}]`)} ${h.title}`,
    );
    console.log(`         ${kleur.dim(h.rel_path)}`);
  }
}
