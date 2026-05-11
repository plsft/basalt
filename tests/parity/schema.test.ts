// tests/parity/schema.test.ts
//
// Schema parity: the canonical SQL in `packages/core/src/migrations/001-init.sql`
// must produce a byte-equivalent set of CREATE statements to the Python
// reference's `SCHEMA` constant (`reference/src/basalt/index.py:12-72`).
//
// We don't compare the entire .sql files verbatim because comments and
// whitespace differ — the contract is "every CREATE TABLE / CREATE INDEX
// statement is identical". The test extracts each `CREATE ...;` statement
// from both sources, normalizes whitespace inside each, and asserts the
// sorted set is identical.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");

function extractStatements(sqlBlob: string): string[] {
  // Strip SQL comments (`--` lines), then split on `;`. Trim and drop empties.
  const noComments = sqlBlob
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
  return noComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map(normalizeWhitespace);
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function readPythonSchema(): string {
  const file = readFileSync(join(REPO_ROOT, "reference", "src", "basalt", "index.py"), "utf-8");
  // Extract the contents of `SCHEMA = """..."""`.
  const m = file.match(/SCHEMA\s*=\s*"""([\s\S]*?)"""/);
  if (!m) throw new Error("could not extract SCHEMA constant from reference/index.py");
  return m[1] ?? "";
}

describe("schema parity: TS migration ↔ Python SCHEMA", () => {
  it("every statement in 001-init.sql appears verbatim in Python's SCHEMA (after whitespace normalization)", () => {
    const tsSql = readFileSync(
      join(REPO_ROOT, "packages", "core", "src", "migrations", "001-init.sql"),
      "utf-8",
    );
    const tsStmts = extractStatements(tsSql).sort();
    const pyStmts = extractStatements(readPythonSchema()).sort();
    expect(tsStmts).toEqual(pyStmts);
  });

  it("the inlined string in src/migrations/index.ts matches the .sql file (whitespace-normalized)", async () => {
    const inline = await import("../../packages/core/src/migrations/index");
    const sqlInline = inline.MIGRATIONS[0]?.sql ?? "";
    const tsSql = readFileSync(
      join(REPO_ROOT, "packages", "core", "src", "migrations", "001-init.sql"),
      "utf-8",
    );
    expect(extractStatements(sqlInline).sort()).toEqual(extractStatements(tsSql).sort());
  });
});
