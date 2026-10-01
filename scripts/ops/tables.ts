import type { Pool } from "pg";

/** Every table in the public schema, ordered so each comes after the tables it references. */
export async function tablesInLoadOrder(pool: Pool): Promise<string[]> {
  const tables = (await pool.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename")).rows.map((r) => r.tablename as string);
  const deps = new Map(tables.map((t) => [t, new Set<string>()]));
  const { rows } = await pool.query(`
    SELECT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent
    FROM pg_constraint c WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace`);
  for (const { child, parent } of rows) if (child !== parent) deps.get(child.replace(/"/g, ""))?.add(parent.replace(/"/g, ""));
  const ordered: string[] = [];
  const visit = (t: string, seen = new Set<string>()) => {
    if (ordered.includes(t) || seen.has(t)) return;
    seen.add(t);
    for (const p of deps.get(t) ?? []) visit(p, seen);
    ordered.push(t);
  };
  tables.forEach((t) => visit(t));
  return ordered;
}
