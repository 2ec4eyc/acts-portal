import { timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../../lib/db.js";
import { sendDueReminders } from "../../lib/finance.js";
import { HttpError, methods } from "../../lib/http.js";

const authorized = (header: string | undefined) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const a = Buffer.from(header), b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
};

// GET /api/cron/daily: run by Vercel Cron once a day (vercel.json) with Authorization: Bearer $CRON_SECRET.
// Payment reminders, then cleanup of old read notifications. Every step is safe to repeat.
export default methods({
  GET: async (req, res) => {
    if (!authorized(req.headers.authorization)) throw new HttpError(401, "Unauthorized");
    const reminders = await sendDueReminders(db);
    const pruned = await db.execute(sql`DELETE FROM notifications WHERE read_at < now() - interval '180 days'`);
    res.status(200).json({ reminders, prunedNotifications: pruned.rowCount ?? 0 });
  },
});
