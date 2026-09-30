// Shared setup for API integration tests: fresh emulator data, migrated into a fresh local database
// with the real export/load scripts, plus sign-in helpers and a minimal Vercel request/response.
// Needs `npm run emulators` and `npm run db:local`. WARNING: wipes both (local only).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Pool } from "pg";

process.env.DATABASE_URL ??= "postgres://postgres:postgres@127.0.0.1:5433/acts";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.MIGRATION_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "acts-migration-"));
export const PROJECT = "acts-bible-school-portal";
if (!["127.0.0.1", "localhost"].includes(new URL(process.env.DATABASE_URL).hostname)) {
  throw new Error("Tests only run against a local database");
}

export type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown>;
export type Result = { status: number; body: any; headers: Record<string, string> };

/** Calls a Vercel-style handler with a minimal request/response pair. */
export async function call(
  handler: Handler,
  opts: { method?: string; token?: string; body?: unknown; query?: Record<string, string>; headers?: Record<string, string> } = {},
): Promise<Result> {
  const req = {
    method: opts.method ?? "GET",
    headers: { ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}), ...opts.headers },
    body: opts.body,
    query: opts.query ?? {},
  } as unknown as VercelRequest;
  const result: Result = { status: 200, body: undefined, headers: {} };
  const res = {
    status(code: number) { result.status = code; return this; },
    json(data: unknown) { result.body = data; return this; },
    send(data: unknown) { result.body = data; return this; },
    setHeader(k: string, v: string) { result.headers[k.toLowerCase()] = v; return this; },
    end() { return this; },
  } as unknown as VercelResponse;
  await handler(req, res);
  return result;
}

const authUrl = (endpoint: string) =>
  `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=fake`;

export async function signIn(email: string, password = "password123") {
  const r = await fetch(authUrl("signInWithPassword"), {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const data = (await r.json()) as { idToken?: string };
  assert.ok(data.idToken, `sign-in failed for ${email}: ${JSON.stringify(data)}`);
  return data.idToken;
}

export async function signUp(email: string) {
  const r = await fetch(authUrl("signUp"), {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "password123", returnSecureToken: true }),
  });
  return ((await r.json()) as { idToken: string }).idToken;
}

export const ROLES = ["admin", "president", "teacher", "student"] as const;
export type Fixture = {
  pool: Pool;
  tokens: Record<(typeof ROLES)[number] | "student2" | "archived" | "stranger", string>;
  /** Postgres user id by seed email prefix (admin, president, teacher, student, student2, old). */
  ids: Record<string, string>;
  /** Postgres offering id by Firestore course id (c1, c2, c9). */
  offerings: Record<string, string>;
  close: () => Promise<void>;
};

/** Rebuilds emulator + database state from the seed. Call once per test file (in `before`). */
export async function setup(): Promise<Fixture> {
  const tsx = (script: string) => execFileSync("npx", ["tsx", script], { env: process.env, stdio: "pipe" });
  execFileSync("node", ["scripts/seed-emulators.mjs"], { stdio: "pipe" });
  tsx("scripts/migrate/export.ts");

  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
  execFileSync("npx", ["drizzle-kit", "migrate"], { env: process.env, stdio: "pipe" });
  tsx("scripts/migrate/load.ts");

  // An archived student's login, and a Firebase login with no portal account.
  const { initializeApp, getApps } = await import("firebase-admin/app");
  const { getAuth } = await import("firebase-admin/auth");
  const admin = getApps().find((a) => a.name === "tests") ?? initializeApp({ projectId: PROJECT }, "tests");
  await getAuth(admin).createUser({ uid: "old1", email: "old@acts.test", password: "password123" });

  const tokens = {} as Fixture["tokens"];
  for (const role of ROLES) tokens[role] = await signIn(`${role}@acts.test`);
  tokens.student2 = await signIn("student2@acts.test");
  tokens.archived = await signIn("old@acts.test");
  tokens.stranger = await signUp("stranger@acts.test");

  const ids: Record<string, string> = {};
  for (const r of (await pool.query("SELECT id, email FROM users")).rows) ids[r.email.split("@")[0]] = r.id;
  const offerings: Record<string, string> = {};
  for (const r of (await pool.query("SELECT id, legacy_id FROM course_offerings")).rows) offerings[r.legacy_id] = r.id;

  return {
    pool, tokens, ids, offerings,
    close: async () => {
      await pool.end();
      const { db } = await import("../server/lib/db.js");
      await (db.$client as Pool).end();
    },
  };
}

/** Imports a route's handler from server/routes, e.g. route("offerings/[id]"). */
export async function route(name: string): Promise<Handler> {
  return (await import(`../server/routes/${name}.js`)).default as Handler;
}
