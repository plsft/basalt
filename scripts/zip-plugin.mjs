#!/usr/bin/env node
// Cross-platform zip step for the Obsidian plugin release workflow.
// Replaces the shell `zip -r ...` invocation that fails on Windows hosts
// where the system `zip` binary isn't on PATH. Node-only — works
// identically on ubuntu-latest, macOS, Windows.
//
// Usage:  node scripts/zip-plugin.mjs <stage-dir> <output-zip>

import { createWriteStream, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { ZipArchive } = require("archiver");

const [stageDir, outFile] = process.argv.slice(2);
if (!stageDir || !outFile) {
  console.error("usage: node scripts/zip-plugin.mjs <stage-dir> <output-zip>");
  process.exit(2);
}

if (!existsSync(stageDir)) {
  console.error(`stage dir does not exist: ${stageDir}`);
  process.exit(1);
}

const out = createWriteStream(resolve(outFile));
const archive = new ZipArchive({ zlib: { level: 9 } });

out.on("close", () => {
  console.log(`zip wrote ${archive.pointer()} bytes to ${outFile}`);
});

archive.on("warning", (err) => {
  if (err.code === "ENOENT") console.warn(err);
  else throw err;
});
archive.on("error", (err) => {
  throw err;
});

archive.pipe(out);
archive.directory(stageDir, false);
await archive.finalize();
