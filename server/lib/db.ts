import { AsyncLocalStorage } from "node:async_hooks";
import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";

// One pool per function instance, reused across invocations (Vercel Fluid compute).
// In production DATABASE_URL is Neon's pooled (-pooler, PgBouncer) connection string.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,                   // per instance; PgBouncer multiplexes onto real connections
  idleTimeoutMillis: 5_000, // release idle clients before the instance suspends
});
attachDatabasePool(pool);   // lets Vercel close idle clients cleanly on suspend

const base = drizzle(pool, { schema });
type Tx = Parameters<Parameters<typeof base.transaction>[0]>[0];

// Requests that change data run in one transaction (see methods() in http.ts). While one is open,
// `db` below resolves to it, so every query of the request, including those in library code, runs
// inside it, and the audit trigger can attribute each write to the signed-in user (setActor).
const request = new AsyncLocalStorage<{ tx: Tx }>();

export const db: typeof base = new Proxy(base, {
  get(target, prop) {
    const tx = prop === "$client" ? undefined : request.getStore()?.tx;
    const source = (tx ?? target) as object;
    const value = Reflect.get(source, prop);
    return typeof value === "function" ? value.bind(source) : value;
  },
});
export type Db = typeof db;

/** Runs `fn` in one transaction that `db` resolves to; it commits only if `fn` succeeds. */
export function inRequestTransaction<T>(fn: () => Promise<T>): Promise<T> {
  return base.transaction(async (tx) => {
    // Rows written in this request without a signed-in user (none today) are tagged "api".
    await tx.execute(sql`SELECT set_config('app.source', 'api', true)`);
    return request.run({ tx }, fn);
  });
}

/**
 * Tells the audit trigger who is acting for the rest of the current request transaction.
 * `true` = transaction-local, so it is safe with Neon's PgBouncer and can't leak to other requests.
 * Outside a request transaction (reads, scripts) it does nothing.
 */
export async function setActor(userId: string) {
  const tx = request.getStore()?.tx;
  if (tx) await tx.execute(sql`SELECT set_config('app.actor_id', ${userId}, true)`);
}
