#!/usr/bin/env node
// packages/mcp/bin/basalt-mcp.js
import("../dist/index.js").catch((err) => {
  console.error("basalt-mcp: failed to load:", err);
  process.exit(1);
});
