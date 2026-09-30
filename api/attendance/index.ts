import { z } from "zod";
import { can, requireUser } from "../../server/lib/auth.js";
import { db } from "../../server/lib/db.js";
import { HttpError, methods, queryParam } from "../../server/lib/http.js";
import { AttendanceSave, listAttendance, roster, saveAttendance } from "../../server/lib/attendance.js";

const Query = z.object({
  offeringId: z.uuid().optional(),
  studentId: z.uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).refine((q) => q.offeringId || q.studentId, { message: "pass offeringId or studentId" })
  .refine((q) => !q.date || q.offeringId, { message: "date needs offeringId" });

// GET /api/attendance?offeringId=&date=: that day's roster (every enrolled student).
// GET /api/attendance?offeringId=|studentId=: all records (students: only their own).
// PUT /api/attendance { offeringId, date, records }: save a day (attendance takers only).
export default methods({
  GET: async (req, res) => {
    const user = await requireUser(req);
    const q = Query.parse({ offeringId: queryParam(req, "offeringId"), studentId: queryParam(req, "studentId"), date: queryParam(req, "date") });
    if (!can(user, "users:read") && (q.studentId !== user.id || q.offeringId)) throw new HttpError(403, "Forbidden");
    if (q.date) return res.status(200).json(await roster(db, q.offeringId!, q.date));
    res.status(200).json(await listAttendance(db, q));
  },
  PUT: async (req, res) => {
    const user = await requireUser(req, "attendance:write");
    await saveAttendance(db, user.id, AttendanceSave.parse(req.body ?? {}));
    const input = req.body as { offeringId: string; date: string };
    res.status(200).json(await roster(db, input.offeringId, input.date));
  },
});
