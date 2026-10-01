import { z } from "zod";
import { requireUser } from "../../lib/auth.js";
import { db } from "../../lib/db.js";
import { HttpError, methods, queryParam } from "../../lib/http.js";
import { buildTranscript } from "../../lib/transcripts.js";

// GET /api/transcripts/preview?studentId=: the transcript as it would be issued now (admins).
export default methods({
  GET: async (req, res) => {
    await requireUser(req, "transcripts:issue");
    const studentId = queryParam(req, "studentId");
    if (!studentId || !z.uuid().safeParse(studentId).success) throw new HttpError(400, "studentId: expected a user id");
    res.status(200).json(await buildTranscript(db, studentId));
  },
});
