// Database connection for the operations scripts. Uses the direct (unpooled) URL, and asks for
// --yes before touching anything that isn't a local database.
import { Pool } from "pg";

export function connect(): Pool {
  const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Set DATABASE_URL_UNPOOLED (direct connection) or DATABASE_URL");
  const host = new URL(connectionString).hostname;
  if (!["127.0.0.1", "localhost"].includes(host) && !process.argv.includes("--yes")) {
    console.error(`This would run against ${host}. Re-run with --yes to confirm.`);
    process.exit(2);
  }
  return new Pool({ connectionString });
}

export const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
