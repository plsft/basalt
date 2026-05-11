// packages/cli/src/commands/promote.ts
// Promote a finding (by its finding_key OR numeric id) to a new vault note.
// Full impl lands in TASK-2.3; today is a working sketch.

import { promoteFindingToNote } from "basalted-core";
import kleur from "kleur";
import { loadConfig } from "../config";
import { runEngine } from "../runtime";

export async function promoteCommand(
  findingIdOrKey: string,
  opts: { vault?: string; db?: string; out?: string },
): Promise<void> {
  const cfg = loadConfig();
  const vault = opts.vault ?? cfg.vault;
  const db = opts.db ?? cfg.dbPath;
  const engine = await runEngine({
    vault,
    db,
    ollamaUrl: cfg.ollamaUrl,
    embeddingModel: cfg.embeddingModel,
  });
  void engine;
  // Hooking promote into the engine pipeline requires loading the
  // persisted finding by key/id and feeding it through promoteFindingToNote.
  // TASK-2.3 wires the storage lookup; today this stub validates the option
  // surface compiles and surfaces a useful error.
  void promoteFindingToNote;
  void findingIdOrKey;
  void opts.out;
  console.error(kleur.yellow("basalt promote: implementation lands in TASK-2.3"));
  process.exitCode = 2;
}
