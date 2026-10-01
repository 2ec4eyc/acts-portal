import { db } from "../lib/db.js";
import { HttpError, methods } from "../lib/http.js";
import { verifyCode } from "../lib/transcripts.js";

// GET /api/verify/:code: public (no sign-in). Says whether a transcript code is genuine and still
// valid, with the student's name and issue date only, never grades.
export default methods({
  GET: async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const result = await verifyCode(db, code);
    if (!result) throw new HttpError(404, "No transcript with this code");
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(result);
  },
});
