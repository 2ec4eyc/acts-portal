import { defineConfig } from "drizzle-kit";

// Migrations must use a direct (unpooled) connection, never PgBouncer.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

export default defineConfig({
  dialect: "postgresql",
  schema: "./server/db/schema.ts",
  out: "./server/db/migrations",
  dbCredentials: { url: url ?? "" },
  strict: true,
});
