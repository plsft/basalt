// packages/core/src/brief/render.ts
// Brief rendering: Markdown / HTML / JSON. Real implementation lands in TASK-1.5.

import type { Brief } from "../types";

export type RenderFormat = "markdown" | "html" | "json";

export function renderBrief(_brief: Brief, _format: RenderFormat): string {
  throw new Error("renderBrief: not yet implemented (lands in TASK-1.5)");
}
