import { requireUser } from "../../server/lib/auth.js";
import { db } from "../../server/lib/db.js";
import { methods } from "../../server/lib/http.js";
import { EnrollInput, enrollStudents } from "../../server/lib/users.js";

// POST /api/users/enroll { studentIds, yearLevel, cohort, schoolYear }: place students in a year
// level, batch and school year, then enroll them in the matching course offerings.
export default methods({
  POST: async (req, res) => {
    await requireUser(req, "users:write");
    const newEnrollments = await enrollStudents(db, EnrollInput.parse(req.body ?? {}));
    res.status(200).json({ newEnrollments });
  },
});
