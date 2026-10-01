import { requireUser } from "../../../lib/auth.js";
import { ArchiveQuery, archiveSummary } from "../../../lib/chat.js";
import { db } from "../../../lib/db.js";
import { methods, queryParam } from "../../../lib/http.js";

// GET /api/chat/archive?before=YYYY-MM-DD: how many messages are older than that day, and chat's size (admins).
export default methods({
  GET: async (req, res) => {
    await requireUser(req, "chat:admin_inbox");
    res.setHeader("Cache-Control", "private, no-store");
    res.status(200).json(await archiveSummary(db, ArchiveQuery.parse({ before: queryParam(req, "before") }).before));
  },
});
