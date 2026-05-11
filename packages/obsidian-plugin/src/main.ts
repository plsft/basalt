// Basalt — Obsidian plugin entry point.

import {
  type Brief,
  type Engine,
  Engine as EngineCtor,
  MockEmbedder,
  OllamaEmbedder,
  promoteFindingToNote,
  renderBrief,
} from "@basalt/core";
import { Notice, Plugin, type WorkspaceLeaf } from "obsidian";
import { ObsidianFilesystem } from "./adapters/fs-obsidian";
import { SqlJsStorage } from "./adapters/storage-sqljs";
import { type BasaltSettings, BasaltSettingTab, DEFAULT_SETTINGS } from "./settings";
import {
  BRIEF_VIEW_TYPE,
  BriefView,
  type BriefViewBridge,
  setBriefViewBridge,
} from "./views/BriefView";

// Reschedule check cadence — every 10 minutes.
const SCHEDULE_INTERVAL_MS = 10 * 60 * 1000;
// One week in ms — used to floor `lastWeeklyRun` checks.
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default class BasaltPlugin extends Plugin {
  settings: BasaltSettings = DEFAULT_SETTINGS;
  private engine: Engine | null = null;
  private storage: SqlJsStorage | null = null;
  private scheduleHandle: number | null = null;

  override async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(BRIEF_VIEW_TYPE, (leaf: WorkspaceLeaf) => new BriefView(leaf));

    this.addRibbonIcon("atom", "Open Basalt Brief", () => {
      void this.activateBriefView();
    });

    const statusBar = this.addStatusBarItem();
    statusBar.setText("Basalt: idle");

    this.addCommand({
      id: "basalt-generate-brief",
      name: "Generate Brief",
      callback: () => {
        void this.activateBriefView().then(() =>
          this.runBrief((m) => statusBar.setText(`Basalt: ${m}`)),
        );
      },
    });

    this.addCommand({
      id: "basalt-reindex",
      name: "Reindex vault",
      callback: () => {
        void this.reindex((m) => statusBar.setText(`Basalt: ${m}`));
      },
    });

    this.addSettingTab(new BasaltSettingTab(this.app, this));

    const bridge: BriefViewBridge = {
      generate: async (onProgress) => this.runBrief(onProgress),
      engine: () => this.engine,
    };
    setBriefViewBridge(bridge);

    this.reschedule();
  }

  override async onunload(): Promise<void> {
    setBriefViewBridge(null);
    if (this.scheduleHandle !== null) {
      window.clearInterval(this.scheduleHandle);
      this.scheduleHandle = null;
    }
    await this.storage?.close();
    this.engine = null;
    this.storage = null;
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

  reschedule(): void {
    if (this.scheduleHandle !== null) {
      window.clearInterval(this.scheduleHandle);
      this.scheduleHandle = null;
    }
    if (this.settings.cadence !== "weekly") return;
    this.scheduleHandle = window.setInterval(() => {
      void this.maybeRunWeekly();
    }, SCHEDULE_INTERVAL_MS);
    // Run an immediate check on settings change.
    void this.maybeRunWeekly();
  }

  private async maybeRunWeekly(): Promise<void> {
    if (this.settings.cadence !== "weekly") return;
    const now = Date.now();
    if (now - this.settings.lastWeeklyRun < WEEK_MS) return;
    new Notice("Basalt: weekly brief running…");
    try {
      const brief = await this.runBrief((m) => {
        // No-op; weekly is background, the BriefView reflects new state when opened.
        void m;
      });
      this.settings.lastWeeklyRun = now;
      await this.saveSettings();
      await this.writeBriefToVault(brief);
      new Notice("Basalt: weekly brief written.");
    } catch (e) {
      new Notice(`Basalt weekly brief failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async ensureEngine(onProgress: (m: string) => void): Promise<Engine> {
    if (this.engine) return this.engine;
    onProgress("Initializing storage…");
    const wasmBinary = await this.loadWasmBinary();
    this.storage = new SqlJsStorage({
      vault: this.app.vault,
      dbPath: ".basalt-index.db",
      ...(wasmBinary !== null ? { wasmBinary } : {}),
    });
    await this.storage.init();
    onProgress("Initializing engine…");
    const fs = new ObsidianFilesystem(this.app);
    const embedderUrl = this.settings.ollamaUrl;
    const model = this.settings.embeddingModel;
    let embedder = new OllamaEmbedder({ url: embedderUrl, model });
    try {
      await embedder.health();
    } catch {
      onProgress("Ollama unreachable — falling back to MockEmbedder.");
      embedder = new MockEmbedder() as unknown as OllamaEmbedder;
    }
    this.engine = await EngineCtor.create({
      storage: this.storage,
      embedding: embedder,
      filesystem: fs,
    });
    return this.engine;
  }

  async runBrief(onProgress: (m: string) => void): Promise<Brief> {
    const engine = await this.ensureEngine(onProgress);
    onProgress("Indexing vault…");
    await engine.index({ vault: "" });
    onProgress("Generating brief…");
    const brief = await engine.brief({ section: "all" });
    onProgress("Done.");
    return brief;
  }

  async reindex(onProgress: (m: string) => void): Promise<void> {
    const engine = await this.ensureEngine(onProgress);
    onProgress("Reindexing (force)…");
    await engine.index({ vault: "", force: true });
    onProgress("Reindex complete.");
  }

  /**
   * Write the current Brief to a vault file. Uses createNoteFile (create-only,
   * never overwrites). Default filename: Basalt/YYYY-MM-DD-brief.md.
   */
  private async writeBriefToVault(brief: Brief): Promise<void> {
    const fs = new ObsidianFilesystem(this.app);
    const date = new Date().toISOString().slice(0, 10);
    const relPath = `${this.settings.promoteFolder}/${date}-brief.md`;
    const body = renderBrief(brief, "markdown");
    await fs.createNoteFile(relPath, body);
  }

  /**
   * Promote a single finding to a new note. Pure function from @basalt/core;
   * file creation happens here via the architecturally-blessed createNoteFile.
   */
  async promoteFindingToVault(findingIndex: number): Promise<string | null> {
    if (!this.engine) {
      new Notice("Basalt: generate a brief first.");
      return null;
    }
    const brief = await this.engine.brief({ section: "all" });
    const findings = collectFindings(brief);
    const finding = findings[findingIndex];
    if (!finding) return null;
    const fs = new ObsidianFilesystem(this.app);
    const { relPath, body } = promoteFindingToNote(finding, {
      folder: this.settings.promoteFolder,
    });
    const created = await fs.createNoteFile(relPath, body);
    if (!created) {
      new Notice(`Basalt: a note already exists at ${relPath}.`);
      return null;
    }
    return relPath;
  }

  private async loadWasmBinary(): Promise<Uint8Array | null> {
    try {
      const pluginDir = `${this.app.vault.configDir}/plugins/basalt`;
      const path = `${pluginDir}/sql-wasm.wasm`;
      const exists = await this.app.vault.adapter.exists(path);
      if (!exists) return null;
      const buf = await this.app.vault.adapter.readBinary(path);
      return new Uint8Array(buf);
    } catch {
      return null;
    }
  }
}

function collectFindings(brief: Brief): import("@basalt/core").Finding[] {
  const out: import("@basalt/core").Finding[] = [];
  for (const arr of Object.values(brief.findings)) {
    if (arr) out.push(...arr);
  }
  return out;
}
