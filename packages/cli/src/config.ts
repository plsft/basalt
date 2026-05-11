// packages/cli/src/config.ts
// CLI config — TOML at ~/.basalt/config.toml. Loaded once at startup; the
// `init` command writes/overwrites it after interactive prompts.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import toml from "@iarna/toml";
import envPaths from "env-paths";

export interface CliConfig {
  vault: string;
  embeddingModel: string;
  ollamaUrl: string;
  promoteFolder: string;
  dbPath: string;
  /** Default LLM provider for the v1 verbs. "none" disables LLM features. */
  llmProvider: "none" | "ollama" | "openai" | "anthropic";
  /** Model name override; provider-specific defaults apply when unset. */
  llmModel: string;
  /** API base URL for `basalt snapshot push`. */
  apiUrl: string;
  /** API session token for `basalt snapshot push`. */
  apiToken: string;
  /** Vault ID this CLI's local index corresponds to on the API side. */
  apiVaultId: string;
}

const paths = envPaths("basalt", { suffix: "" });

export function defaultConfigPath(): string {
  return `${paths.config}/config.toml`;
}

export function defaultDbPath(): string {
  return `${paths.data}/basalt.db`;
}

export function defaultConfig(): CliConfig {
  return {
    vault: `${process.env.HOME ?? process.env.USERPROFILE ?? "."}/notes`,
    embeddingModel: "nomic-embed-text",
    ollamaUrl: "http://localhost:11434",
    promoteFolder: "Basalt",
    dbPath: defaultDbPath(),
    llmProvider: "none",
    llmModel: "",
    apiUrl: "https://api.basalt.dev",
    apiToken: "",
    apiVaultId: "",
  };
}

export function loadConfig(path?: string): CliConfig {
  const p = path ?? defaultConfigPath();
  if (!existsSync(p)) return defaultConfig();
  try {
    const text = readFileSync(p, "utf-8");
    const parsed = toml.parse(text) as Partial<CliConfig>;
    return { ...defaultConfig(), ...parsed };
  } catch (err) {
    throw new Error(`Failed to parse ${p}: ${(err as Error).message}`);
  }
}

export function saveConfig(config: CliConfig, path?: string): string {
  const p = path ?? defaultConfigPath();
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, toml.stringify(config as unknown as toml.JsonMap));
  return p;
}
