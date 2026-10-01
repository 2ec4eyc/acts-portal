import { requireUser } from "../../../lib/auth.js";
import { markAnnouncementRead } from "../../../lib/announcements.js";
import { db } from "../../../lib/db.js";
import { methods, uuidParam } from "../../../lib/http.js";

// POST /api/announcements/:id/read: the caller has seen it.
export default methods({
  POST: async (req, res) => {
    const user = await requireUser(req);
    await markAnnouncementRead(db, user, uuidParam(req));
    res.status(204).end();
  },
});
