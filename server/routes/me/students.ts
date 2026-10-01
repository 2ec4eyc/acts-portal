import { requireUser } from "../../lib/auth.js";
import { db } from "../../lib/db.js";
import { methods } from "../../lib/http.js";
import { teacherStudents } from "../../lib/offerings.js";

// GET /api/me/students: the students in the signed-in teacher's own courses, with their grade and
// attendance in each (staff who can read accounts; empty for someone who teaches nothing).
export default methods({
  GET: async (req, res) => {
    const user = await requireUser(req, "users:read");
    res.setHeader("Cache-Control", "private, no-store");
    res.status(200).json(await teacherStudents(db, user.id));
  },
});
