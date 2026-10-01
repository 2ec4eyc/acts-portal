import { requireUser } from "../../../lib/auth.js";
import { db } from "../../../lib/db.js";
import { methods, uuidParam } from "../../../lib/http.js";
import { addStudents, AddStudentsInput } from "../../../lib/offerings.js";

// POST /api/offerings/:id/enroll { studentIds }: adds students to the course by hand, whatever their
// Day/Night school or year (an exception). Each addition is in the audit log (admins).
export default methods({
  POST: async (req, res) => {
    const user = await requireUser(req, "offerings:write");
    res.status(200).json(await addStudents(db, user.id, uuidParam(req), AddStudentsInput.parse(req.body ?? {}).studentIds));
  },
});
