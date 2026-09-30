import { requireUser } from "../../../lib/auth.js";
import { db } from "../../../lib/db.js";
import { methods, uuidParam } from "../../../lib/http.js";
import { getUserRow, history } from "../../../lib/users.js";

// GET /api/users/:id/history: grade changes and legacy edit history, newest first (staff only).
export default methods({
  GET: async (req, res) => {
    await requireUser(req, "users:read");
    const target = await getUserRow(db, uuidParam(req));
    res.status(200).json(await history(db, target.id));
  },
});
