import { requireUser } from "../../../server/lib/auth.js";
import { db } from "../../../server/lib/db.js";
import { methods, uuidParam } from "../../../server/lib/http.js";
import { getUserRow, history } from "../../../server/lib/users.js";

// GET /api/users/:id/history: grade changes and legacy edit history, newest first (staff only).
export default methods({
  GET: async (req, res) => {
    await requireUser(req, "users:read");
    const target = await getUserRow(db, uuidParam(req));
    res.status(200).json(await history(db, target.id));
  },
});
