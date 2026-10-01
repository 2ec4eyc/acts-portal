import { z } from "zod";
import { requireUser } from "../../lib/auth.js";
import { db } from "../../lib/db.js";
import { HttpError, methods, queryParam } from "../../lib/http.js";
import { getTranscript, IssueInput, issueTranscript, listTranscripts } from "../../lib/transcripts.js";

// GET  /api/transcripts?studentId=: issued transcripts (staff, or the student themself).
// POST /api/transcripts { studentId, purpose? }: issue one (admins).
export default methods({
  GET: async (req, res) => {
    const user = await requireUser(req);
    const studentId = queryParam(req, "studentId");
    if (!studentId || !z.uuid().safeParse(studentId).success) throw new HttpError(400, "studentId: expected a user id");
    res.status(200).json(await listTranscripts(db, user, studentId));
  },
  POST: async (req, res) => {
    const user = await requireUser(req, "transcripts:issue");
    const id = await issueTranscript(db, user, IssueInput.parse(req.body ?? {}));
    res.status(201).json(await getTranscript(db, user, id));
  },
});
