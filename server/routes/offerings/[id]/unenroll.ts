import { requireUser } from "../../../lib/auth.js";
import { db } from "../../../lib/db.js";
import { methods, uuidParam } from "../../../lib/http.js";
import { unenroll, UnenrollInput } from "../../../lib/offerings.js";

// POST /api/offerings/:id/unenroll { studentIds }: removes students from a course, except those with a
// grade or attendance recorded there. Each removal is in the audit log (admins).
export default methods({
  POST: async (req, res) => {
    const user = await requireUser(req, "offerings:write");
    res.status(200).json(await unenroll(db, user.id, uuidParam(req), UnenrollInput.parse(req.body ?? {}).studentIds));
  },
});
