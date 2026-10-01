import { eq } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "./academics.js";
import { HttpError } from "./http.js";
import { appSettings, users } from "../db/schema.js";

// Every settings key with its schema. Defaults live here in code, so a key that was never saved
// (or a newly added field) just takes its default.
export const Features = z.object({
  /** Students can message the school office (chat module). */
  chat: z.boolean().default(true),
  /** Students can upload payment receipts (billing module). */
  receiptUploads: z.boolean().default(true),
  /** Announcements are shown and can be posted. */
  announcements: z.boolean().default(true),
  /** Students see the Schedule page. */
  studentSchedule: z.boolean().default(true),
});
export type Features = z.infer<typeof Features>;

/** When students, their teachers and admins are alerted about absences in a course. */
export const AttendanceAlerts = z.object({
  warnAt: z.number().int().min(1).max(50).default(2),
  escalateAt: z.number().int().min(1).max(50).default(3),
  /** Count excused absences too. */
  countExcused: z.boolean().default(false),
  /** Count "late" as an absence. */
  countLate: z.boolean().default(false),
});

/** Automatic payment reminders (sent by the daily job). */
export const Billing = z.object({
  /** Remind students this many days before an invoice is due (0 = off). */
  reminderDaysBefore: z.number().int().min(0).max(60).default(3),
  /** Remind again every this many days while an invoice is overdue (0 = off). */
  overdueEveryDays: z.number().int().min(0).max(60).default(7),
});

const gb = z.number().min(0.1).max(1000).multipleOf(0.1);

/** Receipt file storage (R2 bucket, or Postgres without R2). */
export const Storage = z.object({
  /** Tell admins when receipt files reach this many GB. */
  warnAtGb: gb.default(7),
  /** Refuse new receipt uploads at this many GB. */
  limitGb: gb.default(9),
  /** Admins may delete the file of an approved receipt once it was approved this many years ago. */
  deleteApprovedAfterYears: z.number().int().min(1).max(20).default(5),
});

const SETTINGS = { features: Features, attendanceAlerts: AttendanceAlerts, billing: Billing, storage: Storage } as const;

/** Rules that involve more than one field, checked on the merged value before saving. */
const CHECKS: { [K in keyof typeof SETTINGS]?: (value: z.infer<(typeof SETTINGS)[K]>) => string | null } = {
  attendanceAlerts: (v) => (v.warnAt < v.escalateAt ? null : "warnAt must be lower than escalateAt"),
  storage: (v) => (v.warnAtGb < v.limitGb ? null : "warnAtGb must be lower than limitGb"),
};
export type SettingKey = keyof typeof SETTINGS;
export const isSettingKey = (key: string): key is SettingKey => Object.hasOwn(SETTINGS, key);

// Per warm function instance: a toggle change reaches every instance within CACHE_MS. The instance
// that saved it sees it at once.
const CACHE_MS = 30_000;
const cache = new Map<SettingKey, { at: number; value: unknown }>();

export async function getSetting<K extends SettingKey>(db: DbOrTx, key: K): Promise<z.infer<(typeof SETTINGS)[K]>> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as z.infer<(typeof SETTINGS)[K]>;
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, key));
  const value = SETTINGS[key].parse(row?.value ?? {});
  cache.set(key, { at: Date.now(), value });
  return value as z.infer<(typeof SETTINGS)[K]>;
}

/** Setting with who changed it last, for the admin panel. */
export async function describeSetting(db: DbOrTx, key: SettingKey) {
  const [row] = await db
    .select({ updatedAt: appSettings.updatedAt, firstName: users.firstName, lastName: users.lastName })
    .from(appSettings).leftJoin(users, eq(users.id, appSettings.updatedBy)).where(eq(appSettings.key, key));
  return {
    key,
    value: await getSetting(db, key),
    updatedAt: row?.updatedAt ?? null,
    updatedBy: row?.firstName ? `${row.firstName} ${row.lastName}` : null,
  };
}

/** Applies a partial change (unknown fields rejected) and saves the full value. */
export async function updateSetting(db: DbOrTx, key: SettingKey, patch: unknown, userId: string) {
  const body = (patch ?? {}) as Record<string, unknown>;
  const parsed = SETTINGS[key].partial().strict().parse(body);
  // .partial() still fills defaults for missing fields; keep only what the request actually sent.
  const changes = Object.fromEntries(Object.entries(parsed).filter(([field]) => Object.hasOwn(body, field)));
  if (!Object.keys(changes).length) throw new HttpError(400, "body: nothing to change");
  cache.delete(key);
  const value = { ...(await getSetting(db, key)), ...changes };
  const problem = (CHECKS[key] as ((v: unknown) => string | null) | undefined)?.(value);
  if (problem) throw new HttpError(400, problem);
  await db.insert(appSettings).values({ key, value, updatedBy: userId, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedBy: userId, updatedAt: new Date() } });
  cache.delete(key);
  return describeSetting(db, key);
}

/** Refuses a request when an admin has switched the feature off. */
export async function requireFeature(db: DbOrTx, name: keyof Features) {
  if (!(await getSetting(db, "features"))[name]) throw new HttpError(403, "This feature is turned off");
}
