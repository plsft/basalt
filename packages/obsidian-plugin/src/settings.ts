// Plugin settings + Obsidian Settings tab UI.

import { type App, PluginSettingTab, Setting } from "obsidian";
import type BasaltPlugin from "./main";

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
  /** Hour of week (0-167) when weekly briefs fire. Default Sun 09:00 UTC = 9. */
  weeklyHour: number;
  /** Last weekly-run epoch ms; the scheduler uses this to throttle. */
  lastWeeklyRun: number;
  /** v1 verb LLM augmentation provider. "none" disables. */
  llmProvider: "none" | "ollama" | "openai" | "anthropic";
  /** Model name override. Provider defaults apply when blank. */
  llmModel: string;
  /** BYOK API key for openai/anthropic. Empty for ollama or none. */
  llmApiKey: string;
}

export const DEFAULT_SETTINGS: BasaltSettings = {
  ollamaUrl: "http://localhost:11434",
  embeddingModel: "nomic-embed-text",
  promoteFolder: "Basalt",
  cadence: "manual",
  privacyOptOut: true,
  weeklyHour: 9,
  lastWeeklyRun: 0,
  llmProvider: "none",
  llmModel: "",
  llmApiKey: "",
};

export class BasaltSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: BasaltPlugin,
  ) {
    super(app, plugin);
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Basalt" });
    containerEl.createEl("p", {
      text: "A second-brain compiler. Local-first, read-only on your vault.",
      cls: "setting-item-description",
    });

    new Setting(containerEl)
      .setName("Ollama URL")
      .setDesc("Local Ollama HTTP endpoint for embeddings.")
      .addText((text) =>
        text
          .setPlaceholder("http://localhost:11434")
          .setValue(this.plugin.settings.ollamaUrl)
          .onChange(async (value) => {
            this.plugin.settings.ollamaUrl = value.trim() || "http://localhost:11434";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Embedding model")
      .setDesc("Ollama model name. Recommended: nomic-embed-text (768-dim).")
      .addText((text) =>
        text
          .setPlaceholder("nomic-embed-text")
          .setValue(this.plugin.settings.embeddingModel)
          .onChange(async (value) => {
            this.plugin.settings.embeddingModel = value.trim() || "nomic-embed-text";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Promote folder")
      .setDesc("Where promote-to-note creates new notes inside this vault.")
      .addText((text) =>
        text
          .setPlaceholder("Basalt")
          .setValue(this.plugin.settings.promoteFolder)
          .onChange(async (value) => {
            this.plugin.settings.promoteFolder = value.trim() || "Basalt";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Brief cadence")
      .setDesc("Manual only, or auto-generate weekly.")
      .addDropdown((dd) =>
        dd
          .addOption("manual", "Manual only")
          .addOption("weekly", "Weekly")
          .setValue(this.plugin.settings.cadence)
          .onChange(async (value) => {
            this.plugin.settings.cadence = value as "manual" | "weekly";
            await this.plugin.saveSettings();
            this.plugin.reschedule();
          }),
      );

    new Setting(containerEl)
      .setName("Weekly run hour (UTC)")
      .setDesc("0–167 hours from the start of the week (Sun 00:00 UTC).")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.weeklyHour)).onChange(async (value) => {
          const n = Number.parseInt(value, 10);
          if (Number.isFinite(n) && n >= 0 && n <= 167) {
            this.plugin.settings.weeklyHour = n;
            await this.plugin.saveSettings();
            this.plugin.reschedule();
          }
        }),
      );

    containerEl.createEl("h3", { text: "LLM augmentation (v1 verbs)" });
    containerEl.createEl("p", {
      text: "Optional: when enabled, generates a named Implicit Thesis and verdicts on Contradictions via the chosen LLM. The base v0 verbs always run.",
      cls: "setting-item-description",
    });

    new Setting(containerEl)
      .setName("LLM provider")
      .setDesc("Pick a backend, or 'None' to keep the v0-only output.")
      .addDropdown((dd) =>
        dd
          .addOption("none", "None — v0 only")
          .addOption("ollama", "Ollama (local)")
          .addOption("openai", "OpenAI (BYOK)")
          .addOption("anthropic", "Anthropic (BYOK)")
          .setValue(this.plugin.settings.llmProvider)
          .onChange(async (value) => {
            this.plugin.settings.llmProvider = value as BasaltSettings["llmProvider"];
            await this.plugin.saveSettings();
            this.display();
          }),
      );

    if (this.plugin.settings.llmProvider !== "none") {
      new Setting(containerEl)
        .setName("LLM model override")
        .setDesc("Blank to use provider default.")
        .addText((text) =>
          text.setValue(this.plugin.settings.llmModel).onChange(async (value) => {
            this.plugin.settings.llmModel = value.trim();
            await this.plugin.saveSettings();
          }),
        );
    }

    if (
      this.plugin.settings.llmProvider === "openai" ||
      this.plugin.settings.llmProvider === "anthropic"
    ) {
      new Setting(containerEl)
        .setName(`${this.plugin.settings.llmProvider} API key`)
        .setDesc(
          "Stored locally in this vault's plugin data. Never leaves your machine except to the provider you selected.",
        )
        .addText((text) => {
          // biome-ignore lint/suspicious/noExplicitAny: Obsidian's text input doesn't type the underlying inputEl on the public API.
          (text as any).inputEl.type = "password";
          text.setValue(this.plugin.settings.llmApiKey).onChange(async (value) => {
            this.plugin.settings.llmApiKey = value.trim();
            await this.plugin.saveSettings();
          });
        });
    }

    new Setting(containerEl)
      .setName("Privacy: opt out of all non-essential network")
      .setDesc("Block any future telemetry or update-check calls. Default: on.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.privacyOptOut).onChange(async (value) => {
          this.plugin.settings.privacyOptOut = value;
          await this.plugin.saveSettings();
        }),
      );

    containerEl.createEl("h3", { text: "Status" });
    const status = containerEl.createDiv();
    status.createEl("p", {
      text: `Last weekly run: ${
        this.plugin.settings.lastWeeklyRun > 0
          ? new Date(this.plugin.settings.lastWeeklyRun).toISOString()
          : "never"
      }`,
    });
  }
}
