import { requireUser } from "../../lib/auth.js";
import { db } from "../../lib/db.js";
import { methods } from "../../lib/http.js";
import { EnrollInput, enrollStudents } from "../../lib/users.js";

// POST /api/users/enroll { studentIds, yearLevel, cohort, schoolYear }: place students in a year
// level, batch and school year, then enroll them in the matching course offerings.
export default methods({
  POST: async (req, res) => {
    await requireUser(req, "users:write");
    const newEnrollments = await enrollStudents(db, EnrollInput.parse(req.body ?? {}));
    res.status(200).json({ newEnrollments });
  },
});
