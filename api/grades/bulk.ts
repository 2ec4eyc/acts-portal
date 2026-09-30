import { z } from "zod";
import { requireUser } from "../../server/lib/auth.js";
import { db } from "../../server/lib/db.js";
import { methods } from "../../server/lib/http.js";
import { GradeInput, writeGrades } from "../../server/lib/grades.js";

const Body = z.strictObject({ items: z.array(GradeInput).min(1).max(5000) });

// POST /api/grades/bulk { items: [{ offeringId, studentId, value, isIncomplete }] }: CSV upload.
// All or nothing: if any row is invalid or not allowed, nothing is saved.
export default methods({
  POST: async (req, res) => {
    const user = await requireUser(req);
    const { items } = Body.parse(req.body ?? {});
    res.status(200).json({ updated: await writeGrades(db, user, items) });
  },
});
