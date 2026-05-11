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
}

export const DEFAULT_SETTINGS: BasaltSettings = {
  ollamaUrl: "http://localhost:11434",
  embeddingModel: "nomic-embed-text",
  promoteFolder: "Basalt",
  cadence: "manual",
  privacyOptOut: true,
  weeklyHour: 9,
  lastWeeklyRun: 0,
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
