import { requireUser } from "../../lib/auth.js";
import { unreadCount } from "../../lib/chat.js";
import { db } from "../../lib/db.js";
import { methods } from "../../lib/http.js";

// GET /api/chat/unread: { count } for the sidebar badge (threads waiting for the office, or 0/1).
export default methods({
  GET: async (req, res) => {
    const user = await requireUser(req);
    res.setHeader("Cache-Control", "private, no-store");
    res.status(200).json({ count: await unreadCount(db, user) });
  },
});
