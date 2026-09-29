import pg from "pg";

// A small interface over two drivers: real PostgreSQL (pg) when running, and
// PGlite - PostgreSQL compiled to WebAssembly, same SQL - for fast tests.
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<void>;
  // Runs fn on ONE connection inside BEGIN/COMMIT: everything lands, or
  // nothing does. Never send BEGIN through query/exec on a pool.
  tx<T>(fn: (t: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

type Runner = { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };

function wrap(run: Runner, exec: (sql: string) => Promise<unknown>, tx: Db["tx"], close: () => Promise<void>): Db {
  return {
    query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await run.query(sql, params)).rows as T[] }),
    exec: async (sql) => {
      await exec(sql);
    },
    tx,
    close,
  };
}

const nested: Db["tx"] = () => {
  throw new Error("Nested transactions are not supported");
};

// NUMERIC (1700) stays text in both drivers, so money and quantities go
// straight into decimal.js without ever becoming a JS number. DATE (1082)
// stays text too: a calendar day must not become a JS Date at local
// midnight and shift by the server's timezone.
pg.types.setTypeParser(1700, (v) => v);
pg.types.setTypeParser(1082, (v) => v);

export async function openDb(databaseUrl: string | null): Promise<Db> {
  if (databaseUrl) {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    const tx: Db["tx"] = async (fn) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn(wrap(client, (sql) => client.query(sql), nested, async () => {}));
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    };
    return wrap(pool, (sql) => pool.query(sql), tx, () => pool.end());
  }
  // No DATABASE_URL: in-memory PGlite, for tests and quick local runs only.
  const { PGlite, types } = await import("@electric-sql/pglite");
  const lite = new PGlite({ parsers: { [types.NUMERIC]: (v: string) => v, [types.DATE]: (v: string) => v } });
  const tx: Db["tx"] = (fn) => lite.transaction((t) => fn(wrap(t, (sql) => t.exec(sql), nested, async () => {})));
  return wrap(lite, (sql) => lite.exec(sql), tx, () => lite.close());
}

// PostgreSQL error code for a unique-constraint violation.
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}
