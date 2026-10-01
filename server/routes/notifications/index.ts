import { requireUser } from "../../lib/auth.js";
import { db } from "../../lib/db.js";
import { methods, queryParam } from "../../lib/http.js";
import { listNotifications } from "../../lib/notifications.js";

// GET /api/notifications[?unread=true]: the caller's own notifications, newest first, plus the unread count.
export default methods({
  GET: async (req, res) => {
    const user = await requireUser(req);
    res.setHeader("Cache-Control", "private, no-store");
    res.status(200).json(await listNotifications(db, user.id, { unreadOnly: queryParam(req, "unread") === "true" }));
  },
});
