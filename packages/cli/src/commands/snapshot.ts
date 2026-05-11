// `basalt snapshot push` — upload the local SQLite index to the API so
// the web cockpit / hosted brief generator can run against it.

import kleur from "kleur";
import { SqliteStorage } from "../adapters/storage-sqlite";
import { loadConfig } from "../config";
import { buildSnapshot, pushSnapshot } from "../snapshot";

export interface SnapshotPushOptions {
  vault?: string;
  db?: string;
  apiUrl?: string;
  apiToken?: string;
  apiVaultId?: string;
  dryRun?: boolean;
}

export async function snapshotPushCommand(opts: SnapshotPushOptions): Promise<void> {
  const cfg = loadConfig();
  const dbPath = opts.db ?? cfg.dbPath;
  const apiUrl = opts.apiUrl ?? cfg.apiUrl;
  const apiToken = opts.apiToken ?? cfg.apiToken ?? process.env.BASALT_API_TOKEN ?? "";
  const apiVaultId = opts.apiVaultId ?? cfg.apiVaultId;

  if (!opts.dryRun && !apiToken) {
    throw new Error(
      "No API token. Set apiToken in ~/.basalt/config.toml or pass --api-token / BASALT_API_TOKEN.",
    );
  }
  if (!opts.dryRun && !apiVaultId) {
    throw new Error(
      "No vault ID. Set apiVaultId in ~/.basalt/config.toml or pass --api-vault-id <id>.",
    );
  }

  const storage = new SqliteStorage(dbPath);
  await storage.init();
  const payload = await buildSnapshot(storage, apiVaultId || "preview");
  await storage.close();

  const json = JSON.stringify(payload);
  console.log(
    kleur.dim(
      `vault=${payload.vault_id}  notes=${payload.notes.length}  embeddings=${payload.embeddings.length}  bytes=${json.length}`,
    ),
  );

  if (opts.dryRun) {
    console.log(kleur.dim("--dry-run: skipping upload."));
    return;
  }

  console.log(kleur.dim(`POST ${apiUrl}/v1/vaults/${apiVaultId}/snapshot`));
  const result = await pushSnapshot(apiUrl, apiToken, payload);
  console.log(
    kleur.green("✓"),
    `uploaded ${result.note_count} notes, ${result.embedding_count} embeddings (${result.bytes} bytes)`,
  );
}
