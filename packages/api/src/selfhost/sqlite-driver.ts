// Runtime-detected SQLite driver. Picks bun:sqlite when running under
// Bun (any platform), better-sqlite3 when running under Node. Both
// expose a narrowly-typed surface that mirrors better-sqlite3's API
// for just the operations our storage adapters use.
//
// Why: Bun on Windows refuses to load better-sqlite3 (native module
// loader rejects it). Bun ships its own SQLite at `bun:sqlite` with a
// near-identical API. We also support Node for the `npm install -g`
// CLI distribution path.

export interface RowOf<T> {
  [k: string]: unknown;
  // Phantom-typed to T for inference downstream.
  __row?: T;
}

export interface PreparedStatement {
  get<T = Record<string, unknown>>(...params: unknown[]): T | undefined;
  all<T = Record<string, unknown>>(...params: unknown[]): T[];
  run(...params: unknown[]): { lastInsertRowid: number | bigint; changes: number };
}

export interface Db {
  prepare(sql: string): PreparedStatement;
  exec(sql: string): void;
  pragma(s: string): unknown;
  transaction<T extends (...args: unknown[]) => unknown>(fn: T): T;
  close(): void;
}

declare const Bun: unknown;

function isBun(): boolean {
  return (
    typeof globalThis !== "undefined" &&
    typeof (globalThis as { Bun?: unknown }).Bun !== "undefined"
  );
}

export async function openDatabase(path: string): Promise<Db> {
  if (isBun()) return openBunDatabase(path);
  return openNodeDatabase(path);
}

async function openBunDatabase(path: string): Promise<Db> {
  const mod = (await import("bun:sqlite" as string)) as { Database: new (p: string) => unknown };
  const db = new mod.Database(path) as {
    query: (sql: string) => {
      get: (...p: unknown[]) => unknown;
      all: (...p: unknown[]) => unknown[];
      run: (...p: unknown[]) => { lastInsertRowid: number | bigint; changes: number };
    };
    exec: (sql: string) => void;
    transaction: <T>(fn: T) => T;
    close: () => void;
    prepare: (sql: string) => unknown;
  };
  return {
    prepare(sql: string): PreparedStatement {
      const q = db.query(sql);
      return {
        get<T = Record<string, unknown>>(...params: unknown[]): T | undefined {
          return (q.get(...params) as T | null) ?? undefined;
        },
        all<T = Record<string, unknown>>(...params: unknown[]): T[] {
          return q.all(...params) as T[];
        },
        run(...params: unknown[]): { lastInsertRowid: number | bigint; changes: number } {
          return q.run(...params);
        },
      };
    },
    exec(sql: string): void {
      db.exec(sql);
    },
    pragma(_s: string): unknown {
      // bun:sqlite's pragma is just exec("PRAGMA <stmt>"). It doesn't
      // return rows, which is fine — we only set pragmas.
      db.exec(`PRAGMA ${_s}`);
      return undefined;
    },
    transaction<T extends (...args: unknown[]) => unknown>(fn: T): T {
      return db.transaction(fn);
    },
    close(): void {
      db.close();
    },
  };
}

async function openNodeDatabase(path: string): Promise<Db> {
  const mod = (await import("better-sqlite3")) as unknown as {
    default: new (p: string) => unknown;
  };
  const Ctor =
    (mod as { default?: new (p: string) => unknown }).default ??
    (mod as unknown as new (
      p: string,
    ) => unknown);
  const db = new (Ctor as new (p: string) => unknown)(path) as {
    prepare: (sql: string) => unknown;
    exec: (sql: string) => void;
    pragma: (s: string) => unknown;
    transaction: <T>(fn: T) => T;
    close: () => void;
  };
  return {
    prepare(sql: string): PreparedStatement {
      const stmt = db.prepare(sql) as {
        get: (...p: unknown[]) => unknown;
        all: (...p: unknown[]) => unknown[];
        run: (...p: unknown[]) => { lastInsertRowid: number | bigint; changes: number };
      };
      return {
        get<T = Record<string, unknown>>(...params: unknown[]): T | undefined {
          return (stmt.get(...params) as T | undefined) ?? undefined;
        },
        all<T = Record<string, unknown>>(...params: unknown[]): T[] {
          return stmt.all(...params) as T[];
        },
        run(...params: unknown[]): { lastInsertRowid: number | bigint; changes: number } {
          return stmt.run(...params);
        },
      };
    },
    exec(sql: string): void {
      db.exec(sql);
    },
    pragma(s: string): unknown {
      return db.pragma(s);
    },
    transaction<T extends (...args: unknown[]) => unknown>(fn: T): T {
      return db.transaction(fn);
    },
    close(): void {
      db.close();
    },
  };
}
