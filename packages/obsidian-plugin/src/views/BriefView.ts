// BriefView — Obsidian ItemView that renders the latest Brief and
// (when invoked) drives an end-to-end indexing + brief-generation cycle
// against @basalt/core. The view talks to the engine through the bridge
// installed on the plugin in onload(); see main.ts.

import type { Brief, Engine } from "@basalt/core";
import { renderBrief } from "@basalt/core";
import { ItemView } from "obsidian";

export const BRIEF_VIEW_TYPE = "basalt-brief";

export interface BriefViewBridge {
  generate: (onProgress: (msg: string) => void) => Promise<Brief>;
  engine: () => Engine | null;
}

let registeredBridge: BriefViewBridge | null = null;
export function setBriefViewBridge(b: BriefViewBridge | null): void {
  registeredBridge = b;
}

export class BriefView extends ItemView {
  private currentBrief: Brief | null = null;

  override getViewType(): string {
    return BRIEF_VIEW_TYPE;
  }

  override getDisplayText(): string {
    return "Basalt Brief";
  }

  override getIcon(): string {
    return "atom";
  }

  override async onOpen(): Promise<void> {
    this.renderShell();
  }

  override async onClose(): Promise<void> {
    // No-op.
  }

  private renderShell(): void {
    const container = this.containerEl.children[1];
    if (!container) return;
    container.empty();
    container.addClass("basalt-brief-view");

    const header = container.createDiv({ cls: "basalt-brief-header" });
    header.createEl("h2", { text: "Basalt Brief" });
    const btn = header.createEl("button", {
      text: "Generate Brief",
      cls: "mod-cta basalt-brief-cta",
    });
    btn.onclick = (): void => {
      void this.runGenerate(btn);
    };

    const progress = container.createDiv({ cls: "basalt-brief-progress" });
    progress.setText("Idle.");

    const body = container.createDiv({ cls: "basalt-brief-body" });
    if (this.currentBrief) {
      body.createEl("pre", { text: renderBrief(this.currentBrief, "markdown") });
    } else {
      body.createEl("p", {
        text: "Click Generate Brief to index your vault and produce a Brief.",
        cls: "basalt-brief-empty",
      });
    }
  }

  private async runGenerate(btn: HTMLButtonElement): Promise<void> {
    if (!registeredBridge) {
      this.setProgress("Engine bridge not installed. Reload the plugin.");
      return;
    }
    btn.disabled = true;
    btn.setText("Generating…");
    try {
      this.setProgress("Starting…");
      const brief = await registeredBridge.generate((m) => this.setProgress(m));
      this.currentBrief = brief;
      this.renderShell();
    } catch (e) {
      this.setProgress(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      btn.disabled = false;
      btn.setText("Generate Brief");
    }
  }

  private setProgress(msg: string): void {
    const container = this.containerEl.children[1];
    const progress = container?.querySelector(".basalt-brief-progress") as HTMLElement | null;
    if (progress) progress.setText(msg);
  }
}
