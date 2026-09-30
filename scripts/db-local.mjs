// Runs a local PostgreSQL 17 server (same major version as Neon) for development and tests.
// Data lives in .local/postgres (or the temp dir when run as root). Usage: npm run db:local  (Ctrl+C to stop)
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// As root (containers), embedded-postgres runs as a separate 'postgres' user that can't write
// inside the project, so keep the data in the world-writable temp dir instead.
const DATA_DIR = process.getuid?.() === 0 ? path.join(os.tmpdir(), 'acts-postgres') : '.local/postgres';
const PORT = Number(process.env.LOCAL_PG_PORT ?? 5433);

const pg = new EmbeddedPostgres({ databaseDir: DATA_DIR, port: PORT, user: 'postgres', password: 'postgres', persistent: true });
if (!existsSync(DATA_DIR)) await pg.initialise();
await pg.start();
try { await pg.createDatabase('acts'); } catch { /* already exists */ }
console.log(`Postgres running: postgres://postgres:postgres@127.0.0.1:${PORT}/acts`);

const stop = async () => { await pg.stop(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
