// How much space receipt files take, the upload limit, alerts to admins, and freeing space.
//
// Tracked usage is the sum of size_bytes of receipts whose file is still stored (exact: R2 uploads are
// size-checked with HEAD). In R2 mode the bucket is also listed by the daily job (or "Recount now"),
// which deletes orphans (uploads that were never submitted) and saves the real total; the larger of the
// two counts against the limit. Sizes use 1 GB = 1,000,000,000 bytes, the smaller of the two common
// definitions, so the limit is never more generous than the provider's.
import { and, desc, eq, ilike, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "./academics.js";
import type { User } from "./auth.js";
import { HttpError } from "./http.js";
import { notify } from "./notifications.js";
import { getSetting } from "./settings.js";
import { bucket, MAX_RECEIPT_BYTES, storageMode } from "./storage.js";
import { invoices, receiptFiles, receiptUploads, storageStatus, users } from "../db/schema.js";

export const GB = 1_000_000_000;
const ORPHAN_AGE_MS = 24 * 60 * 60 * 1000;
const RECOUNT_EVERY_MS = 60 * 1000;
type Level = "ok" | "warn" | "full";
const RANK: Record<Level, number> = { ok: 0, warn: 1, full: 2 };

const fmt = (bytes: number) => `${(bytes / GB).toFixed(bytes < 10 * GB ? 2 : 1)} GB`;

/** Receipts stored in the current mode's place (R2 objects, or rows in receipt_files). */
const storedHere = () => and(
  isNull(receiptUploads.fileDeletedAt),
  sql`${receiptUploads.fileKey} LIKE ${storageMode() === "r2" ? "r2:%" : "db:%"}`,
);

async function status(db: DbOrTx) {
  await db.insert(storageStatus).values({ id: 1 }).onConflictDoNothing();
  const [row] = await db.select().from(storageStatus).where(eq(storageStatus.id, 1));
  return row;
}

/** Usage, limits and the current level. */
export async function usage(db: DbOrTx) {
  const mode = storageMode();
  const rules = await getSetting(db, "storage");
  const [tracked] = await db.select({ files: sql<number>`count(*)::int`, bytes: sql<number>`coalesce(sum(${receiptUploads.sizeBytes}), 0)::bigint` })
    .from(receiptUploads).where(storedHere());
  const byStatus = await db.select({
    status: receiptUploads.status, files: sql<number>`count(*)::int`, bytes: sql<number>`coalesce(sum(${receiptUploads.sizeBytes}), 0)::bigint`,
  }).from(receiptUploads).where(storedHere()).groupBy(receiptUploads.status);
  const [deleted] = await db.select({ files: sql<number>`count(*)::int` }).from(receiptUploads).where(isNotNull(receiptUploads.fileDeletedAt));
  const s = await status(db);
  const trackedBytes = Number(tracked.bytes);
  const measuredBytes = mode === "r2" && s.measuredAt ? s.measuredBytes ?? 0 : null;
  const usedBytes = Math.max(trackedBytes, measuredBytes ?? 0);
  const warnBytes = Math.round(rules.warnAtGb * GB), limitBytes = Math.round(rules.limitGb * GB);
  // "Full" once another largest-size receipt wouldn't fit, so the upload that reaches it raises the alert.
  const level: Level = usedBytes + MAX_RECEIPT_BYTES > limitBytes ? "full" : usedBytes >= warnBytes ? "warn" : "ok";
  return {
    mode, usedBytes, trackedBytes, files: tracked.files, deletedFiles: deleted.files,
    byStatus: Object.fromEntries(["pending", "approved", "rejected"].map((st) => {
      const r = byStatus.find((b) => b.status === st);
      return [st, { files: r?.files ?? 0, bytes: Number(r?.bytes ?? 0) }];
    })) as Record<"pending" | "approved" | "rejected", { files: number; bytes: number }>,
    measured: mode === "r2" ? { bytes: measuredBytes, objects: s.objectCount, at: s.measuredAt, orphansRemoved: s.orphansRemoved } : null,
    warnBytes, limitBytes, level, alertLevel: s.alertLevel,
    deleteApprovedAfterYears: rules.deleteApprovedAfterYears,
  };
}

/** Refuses an upload that would take receipt storage past the limit. */
export async function assertRoom(db: DbOrTx, sizeBytes: number) {
  const u = await usage(db);
  // No alert from here: this request fails, so anything it wrote would be rolled back.
  if (u.usedBytes + sizeBytes > u.limitBytes) {
    throw new HttpError(507, "Receipt storage is full, so receipts can't be uploaded right now. Please tell the school office.");
  }
}

/** Tells every active admin when usage moves up a level (once per crossing). Returns the level. */
export async function checkAlerts(db: DbOrTx): Promise<Level> {
  const u = await usage(db);
  const [row] = await db.select({ level: storageStatus.alertLevel }).from(storageStatus).where(eq(storageStatus.id, 1)).for("update");
  if (row.level === u.level) return u.level;
  await db.update(storageStatus).set({ alertLevel: u.level }).where(eq(storageStatus.id, 1));
  if (RANK[u.level] < RANK[row.level]) return u.level;           // went down: re-arm silently
  const where = u.mode === "r2" ? "Cloudflare R2" : "the database";
  const message = u.level === "full"
    ? { title: "Receipt storage is full", body: `Receipt files use ${fmt(u.usedBytes)} of the ${fmt(u.limitBytes)} limit (${where}). Students can't upload receipts until space is freed or the limit is raised in Settings → Storage.` }
    : { title: "Receipt storage is almost full", body: `Receipt files use ${fmt(u.usedBytes)}; uploads stop at ${fmt(u.limitBytes)} (${where}). Free space in Settings → Storage.` };
  const admins = await db.select({ id: users.id }).from(users).where(and(eq(users.role, "admin"), eq(users.status, "active")));
  await notify(db, admins.map((a) => ({
    userId: a.id, kind: "storage_warning" as const, link: "settings", ...message,
    data: { level: u.level, usedBytes: u.usedBytes, limitBytes: u.limitBytes },
  })));
  return u.level;
}

/**
 * R2 only: lists the bucket, deletes orphans (objects older than a day that no stored receipt points
 * to) and saves the real total. Skipped if the last count was under a minute ago, unless forced.
 */
export async function recount(db: DbOrTx, opts: { force?: boolean } = {}) {
  if (storageMode() !== "r2") throw new HttpError(400, "Receipts are stored in the database; there is no bucket to count");
  const s = await status(db);
  if (!opts.force && s.measuredAt && Date.now() - s.measuredAt.getTime() < RECOUNT_EVERY_MS) {
    return { skipped: true, objects: s.objectCount ?? 0, bytes: s.measuredBytes ?? 0, orphansRemoved: 0 };
  }
  const objects = await bucket.list("receipts/");
  const keys = objects.map((o) => `r2:${o.key}`);
  const referenced = new Set(keys.length ? (await db.select({ key: receiptUploads.fileKey }).from(receiptUploads)
    .where(and(isNull(receiptUploads.fileDeletedAt), inArray(receiptUploads.fileKey, keys)))).map((r) => r.key) : []);
  const cutoff = Date.now() - ORPHAN_AGE_MS;
  const orphans = objects.filter((o) => !referenced.has(`r2:${o.key}`) && o.lastModified.getTime() < cutoff);
  if (orphans.length) await bucket.remove(orphans.map((o) => o.key));
  const kept = objects.filter((o) => !orphans.includes(o));
  const bytes = kept.reduce((sum, o) => sum + o.size, 0);
  await db.update(storageStatus).set({
    measuredBytes: bytes, objectCount: kept.length, measuredAt: new Date(), orphansRemoved: orphans.length,
  }).where(eq(storageStatus.id, 1));
  await checkAlerts(db);
  return { skipped: false, objects: kept.length, bytes, orphansRemoved: orphans.length };
}

/** Daily job: recount the bucket (R2) and send any alert that is due. */
export async function dailyStorageCheck(db: DbOrTx) {
  const counted = storageMode() === "r2" ? await recount(db, { force: true }) : null;
  return { counted, level: await checkAlerts(db) };
}

// ---------- files ----------
type ReceiptRow = typeof receiptUploads.$inferSelect;

/** Why a file can't be deleted, or null if it can. */
export function cannotDelete(r: Pick<ReceiptRow, "status" | "reviewedAt" | "fileDeletedAt">, years: number, now = new Date()) {
  if (r.fileDeletedAt) return "Already deleted";
  if (r.status === "pending") return "Waiting for review";
  if (r.status === "rejected") return null;
  const cutoff = new Date(now);
  cutoff.setFullYear(cutoff.getFullYear() - years);
  return r.reviewedAt && r.reviewedAt < cutoff ? null : `Approved less than ${years} year${years === 1 ? "" : "s"} ago`;
}

export const FileFilter = z.object({
  status: z.enum(["pending", "approved", "rejected", "deleted"]).optional(),
  q: z.string().trim().max(100).optional(),
  deletable: z.enum(["true", "false"]).optional(),
  sort: z.enum(["newest", "largest"]).default("newest"),
  offset: z.coerce.number().int().min(0).default(0),
});
const PAGE = 100;

export async function listFiles(db: DbOrTx, f: z.infer<typeof FileFilter>) {
  const years = (await getSetting(db, "storage")).deleteApprovedAfterYears;
  const name = sql`(${users.firstName} || ' ' || ${users.lastName})`;
  const rows = await db.select({ r: receiptUploads, firstName: users.firstName, lastName: users.lastName, invoiceNumber: invoices.number })
    .from(receiptUploads)
    .innerJoin(users, eq(users.id, receiptUploads.studentId))
    .leftJoin(invoices, eq(invoices.id, receiptUploads.invoiceId))
    .where(and(
      f.status === "deleted" ? isNotNull(receiptUploads.fileDeletedAt)
        : f.status ? and(eq(receiptUploads.status, f.status), isNull(receiptUploads.fileDeletedAt)) : undefined,
      f.q ? or(ilike(name, `%${f.q}%`), ilike(invoices.number, `%${f.q}%`)) : undefined,
      f.deletable === "true" ? and(isNull(receiptUploads.fileDeletedAt), or(
        eq(receiptUploads.status, "rejected"),
        and(eq(receiptUploads.status, "approved"), lt(receiptUploads.reviewedAt, sql`now() - make_interval(years => ${years})`)),
      )) : undefined,
    ))
    .orderBy(...(f.sort === "largest" ? [desc(receiptUploads.sizeBytes)] : []), desc(receiptUploads.createdAt), desc(receiptUploads.id))
    .limit(PAGE + 1).offset(f.offset);
  return {
    files: rows.slice(0, PAGE).map(({ r, firstName, lastName, invoiceNumber }) => ({
      id: r.id, studentId: r.studentId, studentName: `${firstName} ${lastName}`, invoiceNumber,
      contentType: r.contentType, sizeBytes: r.sizeBytes, status: r.status, createdAt: r.createdAt, reviewedAt: r.reviewedAt,
      storedIn: r.fileKey.startsWith("r2:") ? "r2" as const : "db" as const,
      fileDeletedAt: r.fileDeletedAt, cannotDelete: cannotDelete(r, years),
    })),
    nextOffset: rows.length > PAGE ? f.offset + PAGE : null,
  };
}

export const DeleteFilesInput = z.strictObject({ ids: z.array(z.uuid()).min(1).max(200) });

/**
 * Deletes the files (not the receipts) that the rules allow: rejected ones, and approved ones older than
 * the setting. The rows are marked first; R2 objects are deleted last, and any the bucket refuses are
 * left unreferenced, so the next recount removes them as orphans.
 */
export async function deleteFiles(db: DbOrTx, user: User, ids: string[]) {
  const years = (await getSetting(db, "storage")).deleteApprovedAfterYears;
  const rows = await db.select().from(receiptUploads).where(inArray(receiptUploads.id, ids)).for("update");
  const skipped: { id: string; reason: string }[] = ids.filter((id) => !rows.some((r) => r.id === id)).map((id) => ({ id, reason: "Not found" }));
  const ok: ReceiptRow[] = [];
  for (const r of rows) {
    const reason = cannotDelete(r, years);
    if (reason) skipped.push({ id: r.id, reason });
    else ok.push(r);
  }
  let warning: string | null = null;
  if (ok.length) {
    await status(db);
    const okIds = ok.map((r) => r.id);
    await db.update(receiptUploads).set({ fileDeletedAt: new Date(), fileDeletedBy: user.id }).where(inArray(receiptUploads.id, okIds));
    await db.delete(receiptFiles).where(inArray(receiptFiles.receiptId, okIds));
    const r2Keys = ok.filter((r) => r.fileKey.startsWith("r2:")).map((r) => r.fileKey.slice(3));
    if (r2Keys.length) {
      try {
        await bucket.remove(r2Keys);
        // Keep the last measurement honest until the next recount (usage counts the larger of the two).
        const freed = ok.filter((r) => r.fileKey.startsWith("r2:")).reduce((sum, r) => sum + r.sizeBytes, 0);
        await db.update(storageStatus).set({
          measuredBytes: sql`greatest(${storageStatus.measuredBytes} - ${freed}, 0)`,
          objectCount: sql`greatest(${storageStatus.objectCount} - ${r2Keys.length}, 0)`,
        }).where(and(eq(storageStatus.id, 1), isNotNull(storageStatus.measuredAt)));
      } catch (err) {
        console.error("R2 delete failed; the daily cleanup will retry", err);
        warning = "Some files couldn't be removed from the bucket right away; the daily cleanup will remove them.";
      }
    }
    await checkAlerts(db);
  }
  return { deleted: ok.length, freedBytes: ok.reduce((sum, r) => sum + r.sizeBytes, 0), skipped, warning };
}
