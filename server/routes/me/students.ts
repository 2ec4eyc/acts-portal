import { can, requireUser } from "../../lib/auth.js";
import { db } from "../../lib/db.js";
import { HttpError, methods } from "../../lib/http.js";
import { teacherStudents } from "../../lib/offerings.js";

// GET /api/me/students: the students in the signed-in teacher's own courses, with their grade and
// attendance in each (teachers and office staff; empty for someone who teaches nothing).
export default methods({
  GET: async (req, res) => {
    const user = await requireUser(req);
    if (!can(user, "users:read") && !can(user, "students:read_own")) throw new HttpError(403, "Forbidden");
    res.setHeader("Cache-Control", "private, no-store");
    res.status(200).json(await teacherStudents(db, user.id));
  },
});
