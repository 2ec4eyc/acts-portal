import { requireUser } from "../../../../lib/auth.js";
import { markRead } from "../../../../lib/chat.js";
import { db } from "../../../../lib/db.js";
import { methods, uuidParam } from "../../../../lib/http.js";

// POST /api/chat/conversations/:id/read: the reader has seen everything so far.
export default methods({
  POST: async (req, res) => {
    const user = await requireUser(req);
    await markRead(db, user, uuidParam(req));
    res.status(204).end();
  },
});
