// packages/cli/src/commands/about.ts

import kleur from "kleur";
import { VERSION } from "../version";

const BANNER = [
  "       ___",
  "      ╱   ╲",
  "     ╱     ╲      Basalt.",
  "     ╲     ╱      reads your vault, surfaces what you believe.",
  "      ╲___╱",
].join("\n");

export function aboutCommand(): void {
  if (process.stdout.isTTY) {
    console.log(kleur.bold().yellow(BANNER));
  } else {
    console.log(BANNER);
  }
  console.log("");
  console.log(`  version  ${VERSION}`);
  console.log(`  schema   1`);
  console.log(`  source   https://github.com/plsft/basalt`);
  console.log(`  license  MIT (1556 Ventures LLC)`);
}
