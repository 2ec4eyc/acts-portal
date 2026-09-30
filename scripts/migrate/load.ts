// Step 3: load the transformed rows into Postgres in ONE transaction.
// Re-running is safe: rows have deterministic ids and inserts use ON CONFLICT DO NOTHING.
// Usage: DATABASE_URL_UNPOOLED=... npx tsx scripts/migrate/load.ts
import { eq, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as s from "../../server/db/schema.js";
import { transform, type Transformed } from "./transform.js";

type Tables = typeof s.users | typeof s.userProfiles | typeof s.studentRecords | typeof s.studentYearLevels
  | typeof s.schoolYears | typeof s.terms | typeof s.cohorts | typeof s.courses | typeof s.courseOfferings
  | typeof s.offeringMeetings | typeof s.enrollments | typeof s.grades | typeof s.attendanceSessions
  | typeof s.attendanceRecords | typeof s.auditLog;

export async function loadAll(db: NodePgDatabase<typeof s>, t: Transformed) {
  const blocking = t.problems.filter((p) => p.startsWith("BLOCKING"));
  if (blocking.length) throw new Error(`Refusing to load:\n${blocking.join("\n")}`);

  await db.transaction(async (tx) => {
    const insert = async <T extends Tables>(table: T, rows: T["$inferInsert"][]) => {
      for (let i = 0; i < rows.length; i += 500) {
        await tx.insert(table).values(rows.slice(i, i + 500) as never).onConflictDoNothing();
      }
    };
    // Parents before children (foreign-key order).
    await insert(s.schoolYears, [...t.schoolYears].map(([label, id]) => ({ id, label })));
    await insert(s.terms, [...t.terms.values()]);
    await insert(s.cohorts, [...t.cohorts.values()]);
    await insert(s.users, t.users);
    await insert(s.userProfiles, t.userProfiles);
    await insert(s.studentRecords, t.studentRecords);
    await insert(s.studentYearLevels, t.studentYearLevels);
    await insert(s.courses, [...t.courses.values()]);
    await insert(s.courseOfferings, t.offerings);
    await insert(s.offeringMeetings, t.meetings);
    await insert(s.enrollments, t.enrollments);
    await insert(s.grades, t.grades);
    await insert(s.attendanceSessions, [...t.sessions.values()]);
    await insert(s.attendanceRecords, t.records);
    // Audit rows have no natural key: replace the legacy ones wholesale.
    await tx.delete(s.auditLog).where(eq(s.auditLog.action, "legacy.edit_history"));
    await insert(s.auditLog, t.auditLog);
    // Explicit ids went into serial columns: move each sequence past them.
    for (const table of ["school_years", "terms", "cohorts"]) {
      await tx.execute(sql.raw(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT max(id) FROM ${table}), 0) + 1, false)`));
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Set DATABASE_URL_UNPOOLED (direct connection) or DATABASE_URL");
  const pool = new Pool({ connectionString });
  const t = transform();
  console.log(t.problems.length ? `${t.problems.length} problem(s):\n  ${t.problems.join("\n  ")}` : "No problems.");
  await loadAll(drizzle(pool, { schema: s }), t);
  console.log(`Loaded ${t.users.length} users, ${t.offerings.length} offerings, ${t.enrollments.length} enrollments, ${t.grades.length} grades, ${t.records.length} attendance records.`);
  await pool.end();
}
