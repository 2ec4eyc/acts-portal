import { can, requireUser } from "../../../lib/auth.js";
import { assertTeachesStudent } from "../../../lib/offerings.js";
import { db } from "../../../lib/db.js";
import { methods, uuidParam } from "../../../lib/http.js";
import { getUserRow, history } from "../../../lib/users.js";

// GET /api/users/:id/history: grade changes and legacy edit history, newest first (office staff, or a
// teacher for a student in their own courses).
export default methods({
  GET: async (req, res) => {
    const user = await requireUser(req);
    const target = await getUserRow(db, uuidParam(req));
    await assertTeachesStudent(db, user, target.id);
    res.status(200).json(await history(db, target.id, can(user, "users:read") ? undefined : user.id));
  },
});
