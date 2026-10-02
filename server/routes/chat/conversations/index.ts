import { z } from "zod";
import { can, requireUser } from "../../../lib/auth.js";
import { InboxFilter, listConversations, myConversation, startConversation } from "../../../lib/chat.js";
import { db } from "../../../lib/db.js";
import { HttpError, methods, queryParam } from "../../../lib/http.js";

// GET  /api/chat/conversations[?role=student|teacher]: the school office's inbox (admins), or a student's
//      or teacher's own thread (created on first use) with { chatEnabled }.
// POST /api/chat/conversations { studentId }: the office starts (or opens) a thread with a student or
//      teacher (the field keeps its name; it's the member's account id).
export default methods({
  GET: async (req, res) => {
    const user = await requireUser(req);
    res.setHeader("Cache-Control", "private, no-store");
    if (!can(user, "chat:admin_inbox")) return res.status(200).json(await myConversation(db, user));
    const f = InboxFilter.parse({ q: queryParam(req, "q"), unread: queryParam(req, "unread"), status: queryParam(req, "status"), role: queryParam(req, "role") });
    res.status(200).json(await listConversations(db, user, f));
  },
  POST: async (req, res) => {
    const user = await requireUser(req);
    if (!can(user, "chat:admin_inbox")) throw new HttpError(403, "Forbidden");
    const { studentId } = z.strictObject({ studentId: z.uuid() }).parse(req.body ?? {});
    res.status(200).json({ id: await startConversation(db, studentId) });
  },
});
