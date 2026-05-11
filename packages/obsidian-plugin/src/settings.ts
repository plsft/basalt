// packages/obsidian-plugin/src/settings.ts
// Settings tab — full implementation in TASK-1.17.

export interface BasaltSettings {
  /** Override for the indexed vault path. Default: current vault root. */
  vaultOverride?: string;
  /** Ollama HTTP endpoint. Default http://localhost:11434. */
  ollamaUrl: string;
  /** Embedding model. Default nomic-embed-text. */
  embeddingModel: string;
  /** Folder where promote-to-note creates new files. Default "Basalt". */
  promoteFolder: string;
  /** Brief cadence: "manual" or weekly auto. */
  cadence: "manual" | "weekly";
  /** Privacy: opt out of any non-essential network calls (default true). */
  privacyOptOut: boolean;
}

export const DEFAULT_SETTINGS: BasaltSettings = {
  ollamaUrl: "http://localhost:11434",
  embeddingModel: "nomic-embed-text",
  promoteFolder: "Basalt",
  cadence: "manual",
  privacyOptOut: true,
};
