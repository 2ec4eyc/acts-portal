import { requireUser } from "../../lib/auth.js";
import { db } from "../../lib/db.js";
import { methods } from "../../lib/http.js";
import { MarkRead, markRead } from "../../lib/notifications.js";

// POST /api/notifications/read { ids } | { all: true }: marks the caller's notifications read.
export default methods({
  POST: async (req, res) => {
    const user = await requireUser(req);
    await markRead(db, user.id, MarkRead.parse(req.body ?? {}));
    res.status(204).end();
  },
});
