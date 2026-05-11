// Desktop settings persistence. Uses localStorage in the WebView (Tauri
// stores it under the app data dir per the WebView's defaults; sandboxed
// per-app). No sync, no network — settings stay local.

export interface DesktopSettings {
  ollamaUrl: string;
  embeddingModel: string;
  llmProvider: "none" | "ollama" | "openai" | "anthropic";
  llmModel: string;
  llmApiKey: string;
  /** Folder under the user's vault where promote-to-note writes new files. */
  promoteFolder: string;
  apiUrl: string;
  apiToken: string;
  apiVaultId: string;
}

const KEY = "basalt:desktop-settings:v1";

export function defaultSettings(): DesktopSettings {
  return {
    ollamaUrl: "http://localhost:11434",
    embeddingModel: "nomic-embed-text",
    llmProvider: "none",
    llmModel: "",
    llmApiKey: "",
    promoteFolder: "Basalt",
    apiUrl: "https://api.basalted.com",
    apiToken: "",
    apiVaultId: "",
  };
}

export function loadSettings(): DesktopSettings {
  if (typeof localStorage === "undefined") return defaultSettings();
  const raw = localStorage.getItem(KEY);
  if (!raw) return defaultSettings();
  try {
    return { ...defaultSettings(), ...(JSON.parse(raw) as Partial<DesktopSettings>) };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(s: DesktopSettings): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(s));
}
