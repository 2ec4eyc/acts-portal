import { requireUser } from "../../../lib/auth.js";
import { db } from "../../../lib/db.js";
import { methods, uuidParam } from "../../../lib/http.js";
import { mismatchedStudents } from "../../../lib/offerings.js";

// GET /api/offerings/:id/mismatched: enrolled students who aren't from the course's school (Day/Night),
// each with the reason they can't be removed, if any (admins).
export default methods({
  GET: async (req, res) => {
    await requireUser(req, "offerings:write");
    res.status(200).json(await mismatchedStudents(db, uuidParam(req)));
  },
});
