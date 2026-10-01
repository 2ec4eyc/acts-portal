import { requireUser } from "../../../lib/auth.js";
import { db } from "../../../lib/db.js";
import { methods, uuidParam } from "../../../lib/http.js";
import { courseStudents } from "../../../lib/offerings.js";

// GET /api/offerings/:id/students: everyone enrolled, flagged when added by hand or from the other
// Day/Night school, with the reason they can't be removed, if any (admins).
export default methods({
  GET: async (req, res) => {
    await requireUser(req, "offerings:write");
    res.status(200).json(await courseStudents(db, uuidParam(req)));
  },
});
