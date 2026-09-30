import { z } from "zod";
import { can, requireUser } from "../../server/lib/auth.js";
import { db } from "../../server/lib/db.js";
import { HttpError, methods, queryParam } from "../../server/lib/http.js";
import { assertCanGrade, GradeInput, listGrades, writeGrade } from "../../server/lib/grades.js";

const Filter = z.object({ studentId: z.uuid().optional(), offeringId: z.uuid().optional() })
  .refine((f) => f.studentId || f.offeringId, { message: "pass studentId or offeringId" });

// GET    /api/grades?studentId=|offeringId=: grades per enrollment (students: only their own).
// PUT    /api/grades { offeringId, studentId, value, isIncomplete }: set one grade.
// DELETE /api/grades?offeringId=&studentId=: reset a grade to pending (the student stays enrolled).
export default methods({
  GET: async (req, res) => {
    const user = await requireUser(req);
    const filter = Filter.parse({ studentId: queryParam(req, "studentId"), offeringId: queryParam(req, "offeringId") });
    if (!can(user, "users:read") && (filter.studentId !== user.id || filter.offeringId)) {
      throw new HttpError(403, "Forbidden");
    }
    res.status(200).json(await listGrades(db, filter));
  },
  PUT: async (req, res) => {
    const user = await requireUser(req);
    const input = GradeInput.parse(req.body ?? {});
    await db.transaction(async (tx) => {
      await assertCanGrade(tx, user, input.offeringId);
      await writeGrade(tx, user.id, input);
    });
    const [grade] = (await listGrades(db, { studentId: input.studentId, offeringId: input.offeringId }));
    res.status(200).json(grade);
  },
  DELETE: async (req, res) => {
    const user = await requireUser(req);
    const offeringId = z.uuid().parse(queryParam(req, "offeringId"));
    const studentId = z.uuid().parse(queryParam(req, "studentId"));
    await db.transaction(async (tx) => {
      await assertCanGrade(tx, user, offeringId);
      await writeGrade(tx, user.id, { offeringId, studentId, value: null, isIncomplete: false }, true);
    });
    res.status(204).end();
  },
});
