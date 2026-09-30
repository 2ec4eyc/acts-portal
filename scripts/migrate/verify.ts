// Step 4: compare what's in Postgres with the Firestore dump. Exits 1 on any mismatch.
// Usage: DATABASE_URL_UNPOOLED=... npx tsx scripts/migrate/verify.ts
import { createHash } from "node:crypto";
import { Pool } from "pg";
import { transform } from "./transform.js";

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("Set DATABASE_URL_UNPOOLED or DATABASE_URL");
const pool = new Pool({ connectionString });
const t = transform();
let failures = 0;
const check = (label: string, expected: unknown, actual: unknown) => {
  const ok = JSON.stringify(expected) === JSON.stringify(actual);
  if (!ok) failures++;
  console.log(`${ok ? "OK  " : "FAIL"} ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const count = async (table: string) => Number((await pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count);

check("users", t.users.length, await count("users"));
check("archived users", t.users.filter((u) => u.status === "archived").length, await count("users WHERE status = 'archived'"));
check("course offerings", t.offerings.length, await count("course_offerings"));
check("enrollments", t.enrollments.length, await count("enrollments"));
check("grades", t.grades.length, await count("grades"));
check("attendance records", t.records.length, await count("attendance_records"));
check("files", t.materials.length, await count("materials"));
check("file bytes", t.materialFiles.reduce((n, f) => n + f.content.length, 0),
  Number((await pool.query("SELECT coalesce(sum(length(content)), 0) AS n FROM material_files")).rows[0].n));

// Per-student checksum of (offering, grade value, incomplete) must match exactly.
const digest = (rows: string[]) => createHash("sha256").update(rows.sort().join("\n")).digest("hex").slice(0, 16);
const expected = new Map<string, string[]>();
const byEnrollment = new Map(t.enrollments.map((e) => [e.id!, e]));
for (const g of t.grades) {
  const e = byEnrollment.get(g.enrollmentId)!;
  expected.set(e.studentId, [...(expected.get(e.studentId) ?? []), `${e.offeringId}|${g.value ?? ""}|${g.isIncomplete ?? false}`]);
}
const { rows } = await pool.query(`
  SELECT e.student_id, e.offering_id, g.value, g.is_incomplete
  FROM grades g JOIN enrollments e ON e.id = g.enrollment_id`);
const actual = new Map<string, string[]>();
for (const r of rows) actual.set(r.student_id, [...(actual.get(r.student_id) ?? []), `${r.offering_id}|${r.value ?? ""}|${r.is_incomplete}`]);
let mismatched = 0;
for (const id of new Set([...expected.keys(), ...actual.keys()])) {
  if (digest(expected.get(id) ?? []) !== digest(actual.get(id) ?? [])) { mismatched++; console.log(`FAIL grades for student ${id}`); }
}
check("students with mismatched grades", 0, mismatched);

await pool.end();
console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);
