import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";
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

export const db = drizzle(pool, { schema });
export type Db = typeof db;
