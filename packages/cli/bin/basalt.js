#!/usr/bin/env node
// packages/cli/bin/basalt.js
// Thin entry for `npm install -g @basalt/cli`. The compiled single-binary
// (bun build --compile) skips this and bundles src/index.ts directly.

import("../dist/index.js").catch((err) => {
  console.error("basalt: failed to load CLI:", err);
  process.exit(1);
});
