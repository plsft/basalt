// packages/cli/src/commands/doctor.ts
// `basalt doctor` — pre-flight health checks. Mirror of Python's
// `basalt doctor` from reference/src/basalt/wizard.py.
//
// Returns exit code 0 if every check passes, 1 otherwise. Prints one
// line per check with a status glyph so output is grep-friendly.

import { existsSync } from "node:fs";
import kleur from "kleur";
import { loadConfig } from "../config";

type CheckResult = { name: string; ok: boolean; detail: string };

async function checkVault(vault: string): Promise<CheckResult> {
  if (!vault) return { name: "vault path", ok: false, detail: "not configured" };
  if (!existsSync(vault)) return { name: "vault path", ok: false, detail: `missing: ${vault}` };
  return { name: "vault path", ok: true, detail: vault };
}

function checkIndexDb(dbPath: string): CheckResult {
  if (!dbPath) return { name: "index db", ok: false, detail: "not configured" };
  const present = existsSync(dbPath);
  return {
    name: "index db",
    ok: present,
    detail: present ? dbPath : `not yet built — run 'basalt index' (${dbPath})`,
  };
}

async function checkOllama(url: string, model: string): Promise<CheckResult[]> {
  const base = url.replace(/\/$/, "");
  let tagsRes: Response;
  try {
    tagsRes = await fetch(`${base}/api/tags`, { method: "GET" });
  } catch (err) {
    return [
      { name: "ollama reachable", ok: false, detail: `${url} — ${(err as Error).message}` },
      { name: "embedding model", ok: false, detail: "skipped (ollama unreachable)" },
    ];
  }
  if (!tagsRes.ok) {
    return [
      { name: "ollama reachable", ok: false, detail: `${url} returned HTTP ${tagsRes.status}` },
      { name: "embedding model", ok: false, detail: "skipped (ollama unhealthy)" },
    ];
  }
  let tags: { models?: Array<{ name?: string }> };
  try {
    tags = (await tagsRes.json()) as { models?: Array<{ name?: string }> };
  } catch {
    return [
      { name: "ollama reachable", ok: true, detail: url },
      { name: "embedding model", ok: false, detail: "could not parse /api/tags response" },
    ];
  }
  const installed = (tags.models ?? []).map((m) => m.name ?? "").filter(Boolean);
  const hit = installed.some((n) => n === model || n.startsWith(`${model}:`));
  return [
    { name: "ollama reachable", ok: true, detail: url },
    {
      name: "embedding model",
      ok: hit,
      detail: hit ? model : `not installed — run 'ollama pull ${model}'`,
    },
  ];
}

function checkApiConfig(apiUrl: string, apiToken: string): CheckResult {
  if (!apiToken) {
    return {
      name: "api credentials",
      ok: true,
      detail: kleur.dim("none configured (Open tier — that's fine)"),
    };
  }
  if (!apiUrl) {
    return {
      name: "api credentials",
      ok: false,
      detail: "token set but apiUrl is empty",
    };
  }
  return { name: "api credentials", ok: true, detail: apiUrl };
}

function glyph(ok: boolean): string {
  return ok ? kleur.green("✓") : kleur.red("✗");
}

export async function doctorCommand(): Promise<void> {
  const cfg = loadConfig();
  console.log(kleur.bold("Basalt doctor — running pre-flight checks\n"));

  const results: CheckResult[] = [];
  results.push(await checkVault(cfg.vault));
  results.push(checkIndexDb(cfg.dbPath));
  results.push(...(await checkOllama(cfg.ollamaUrl, cfg.embeddingModel)));
  results.push(checkApiConfig(cfg.apiUrl, cfg.apiToken));

  const nameWidth = results.reduce((m, r) => Math.max(m, r.name.length), 0);
  for (const r of results) {
    console.log(`  ${glyph(r.ok)} ${r.name.padEnd(nameWidth)}  ${r.detail}`);
  }

  const failures = results.filter((r) => !r.ok);
  console.log("");
  if (failures.length === 0) {
    console.log(kleur.green(`All ${results.length} checks passed.`));
    return;
  }
  console.log(kleur.red(`${failures.length} of ${results.length} checks failed.`));
  process.exitCode = 1;
}
