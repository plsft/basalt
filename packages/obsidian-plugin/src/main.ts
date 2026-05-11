// packages/obsidian-plugin/src/main.ts
// Plugin entry point. Full UI + indexing wires land in TASK-1.16 / 1.17 / 1.18.

import { type EmbeddingAdapter, OllamaEmbedder } from "@basalt/core";
import { Plugin, type WorkspaceLeaf } from "obsidian";
import { ObsidianFilesystem } from "./adapters/fs-obsidian";
import { SqlJsStorage } from "./adapters/storage-sqljs";
import { type BasaltSettings, DEFAULT_SETTINGS } from "./settings";
import { BRIEF_VIEW_TYPE, BriefView } from "./views/BriefView";

export default class BasaltPlugin extends Plugin {
  settings: BasaltSettings = DEFAULT_SETTINGS;

  override async onload(): Promise<void> {
    console.log("Basalt: loading");
    await this.loadSettings();

    this.registerView(BRIEF_VIEW_TYPE, (leaf: WorkspaceLeaf) => new BriefView(leaf));

    // Ribbon icon — TASK-1.16 wires the click handler to generate a Brief.
    this.addRibbonIcon("atom", "Open Basalt Brief", () => {
      void this.activateBriefView();
    });

    // Status-bar item — TASK-1.16 / 1.18 update this with indexing/cadence.
    const statusBar = this.addStatusBarItem();
    statusBar.setText("Basalt: idle");

    // Adapters wire-up sketch (real engine + index pipeline lands in TASK-1.16).
    const _fs = new ObsidianFilesystem(this.app);
    const _storage = new SqlJsStorage();
    const _embed: EmbeddingAdapter = new OllamaEmbedder({
      url: this.settings.ollamaUrl,
      model: this.settings.embeddingModel,
    });
    void _fs;
    void _storage;
    void _embed;
  }

  override async onunload(): Promise<void> {
    console.log("Basalt: unloading");
  }

  async activateBriefView(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(BRIEF_VIEW_TYPE);
    if (existing.length > 0 && existing[0]) {
      workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = workspace.getLeaf(true);
    await leaf.setViewState({ type: BRIEF_VIEW_TYPE, active: true });
    workspace.revealLeaf(leaf);
  }

  async loadSettings(): Promise<void> {
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...((await this.loadData()) as Partial<BasaltSettings>),
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
