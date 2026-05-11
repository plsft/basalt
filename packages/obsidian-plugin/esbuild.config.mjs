// packages/obsidian-plugin/esbuild.config.mjs
//
// Build the Obsidian plugin into a single bundled main.js + manifest.json.
// The plugin runs inside Obsidian's Electron host; CommonJS output is
// required for the loader. External libraries (obsidian, electron, node
// built-ins) are NOT bundled — they're provided by the host.

import process from "node:process";
import esbuild from "esbuild";

const isProd = process.argv.includes("production");
const banner = `/*
 * THIS IS A GENERATED / BUNDLED FILE BY ESBUILD
 * Source: packages/obsidian-plugin/src/main.ts
 * If you want to view the source, please visit the GitHub repository.
 */
`;

const ctx = await esbuild.context({
  banner: { js: banner },
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
  ],
  format: "cjs",
  target: "es2022",
  logLevel: "info",
  sourcemap: isProd ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: isProd,
});

if (isProd) {
  await ctx.rebuild();
  await ctx.dispose();
} else {
  await ctx.watch();
}
