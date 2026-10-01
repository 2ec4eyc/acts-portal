import { requireUser } from "../../../lib/auth.js";
import { exportArchive, ExportQuery } from "../../../lib/chat.js";
import { db } from "../../../lib/db.js";
import { methods, queryParam } from "../../../lib/http.js";

// GET /api/chat/archive/messages?before=&afterId=: the messages to archive, 2000 at a time (admins).
export default methods({
  GET: async (req, res) => {
    await requireUser(req, "chat:admin_inbox");
    res.setHeader("Cache-Control", "private, no-store");
    res.status(200).json(await exportArchive(db, ExportQuery.parse({ before: queryParam(req, "before"), afterId: queryParam(req, "afterId") })));
  },
});
