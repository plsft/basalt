// packages/obsidian-plugin/src/views/BriefView.ts
// BriefView ItemView — full implementation in TASK-1.16.

import { ItemView, type WorkspaceLeaf } from "obsidian";

export const BRIEF_VIEW_TYPE = "basalt-brief";

export class BriefView extends ItemView {
  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

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
    const container = this.containerEl.children[1];
    if (!container) return;
    container.empty();
    container.createEl("h2", { text: "Basalt Brief" });
    container.createEl("p", {
      text: "Generate a brief from the ribbon to populate this view (TASK-1.16).",
    });
  }

  override async onClose(): Promise<void> {
    // No-op for now.
  }
}
