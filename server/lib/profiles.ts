import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "./db.js";
import { cohorts, schoolYears, studentRecords, studentYearLevels, userProfiles, users } from "../db/schema.js";

/** Full profile as returned by the API. */
export async function loadProfile(db: Db, userId: string) {
  const [row] = await db
    .select({ user: users, profile: userProfiles, student: studentRecords, cohortName: cohorts.name })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .leftJoin(studentRecords, eq(studentRecords.userId, users.id))
    .leftJoin(cohorts, eq(cohorts.id, studentRecords.cohortId))
    .where(eq(users.id, userId));
  if (!row) return null;
  const { user, profile, student, cohortName } = row;

  const yearLevels = user.role === "student"
    ? await db
        .select({ yearLevel: studentYearLevels.yearLevel, schoolYear: schoolYears.label })
        .from(studentYearLevels)
        .innerJoin(schoolYears, eq(schoolYears.id, studentYearLevels.schoolYearId))
        .where(eq(studentYearLevels.studentId, userId))
        .orderBy(asc(studentYearLevels.yearLevel))
    : [];

  const { userId: _p, ...personal } = profile ?? ({} as Partial<typeof userProfiles.$inferSelect>);
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    middleName: user.middleName,
    lastName: user.lastName,
    fullName: [user.firstName, user.middleName, user.lastName].filter(Boolean).join(" "),
    photoUrl: user.photoUrl,
    contactNumber: user.contactNumber,
    role: user.role,
    staffCategory: user.staffCategory,
    status: user.status,
    profile: personal,
    student: user.role === "student"
      ? {
          studentNo: student?.studentNo ?? null,
          schoolType: student?.schoolType ?? null,
          cohort: cohortName ?? null,
          currentYearLevel: student?.currentYearLevel ?? null,
          yearLevels,
        }
      : null,
  };
}
export type ProfileDto = NonNullable<Awaited<ReturnType<typeof loadProfile>>>;

const text = (max: number) => z.string().trim().max(max).nullable();
const isoDate = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"), z.literal("").transform(() => null)]).nullable();

/**
 * Fields a user may change on their own account; keep in sync with PROFILE_SELF_EDITABLE_FIELDS
 * (src/constants.ts) and selfEditableFields() in firestore.rules. Unknown keys are rejected.
 */
export const SelfProfileUpdate = z.strictObject({
  firstName: z.string().trim().min(1).max(100),
  middleName: text(100),
  lastName: z.string().trim().min(1).max(100),
  photoUrl: z.string().max(1_000_000).nullable(), // data URL today; moves to Vercel Blob later
  contactNumber: text(40),
  gender: z.enum(["Male", "Female"]).nullable(),
  birthDate: isoDate,
  address: text(300),
  city: text(100),
  province: text(100),
  postalCode: text(20),
  church: text(200),
  pastorName: text(200),
  holyGhostBaptismDate: isoDate,
  holyGhostBaptismLocation: text(200),
  waterBaptismDate: isoDate,
  waterBaptismLocation: text(200),
  emergencyFirstName: text(100),
  emergencyLastName: text(100),
  emergencyRelationship: text(100),
  emergencyContactNumber: text(40),
  // Admins may also set their own staff category.
  staffCategory: z.enum(["day_secretary", "night_secretary", "faculty", "admin"]).nullable(),
}).partial();
export type SelfProfileUpdate = z.infer<typeof SelfProfileUpdate>;

const USER_COLUMNS = ["firstName", "middleName", "lastName", "photoUrl", "contactNumber", "staffCategory"] as const;

/** Applies a validated update, splitting it between `users` and `user_profiles`, in one transaction. */
export async function applySelfUpdate(db: Db, userId: string, update: SelfProfileUpdate) {
  const userPatch: Partial<typeof users.$inferInsert> = {};
  const profilePatch: Partial<typeof userProfiles.$inferInsert> = {};
  for (const [key, value] of Object.entries(update)) {
    if ((USER_COLUMNS as readonly string[]).includes(key)) (userPatch as Record<string, unknown>)[key] = value;
    else (profilePatch as Record<string, unknown>)[key] = value;
  }
  await db.transaction(async (tx) => {
    if (Object.keys(userPatch).length) await tx.update(users).set(userPatch).where(eq(users.id, userId));
    if (Object.keys(profilePatch).length) {
      await tx.insert(userProfiles).values({ userId, ...profilePatch })
        .onConflictDoUpdate({ target: userProfiles.userId, set: profilePatch });
    }
  });
}
