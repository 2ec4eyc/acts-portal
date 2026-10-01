import { requireUser } from "../../../../lib/auth.js";
import { listMessages, MessageQuery, SendInput, sendMessage } from "../../../../lib/chat.js";
import { db } from "../../../../lib/db.js";
import { methods, queryParam, uuidParam } from "../../../../lib/http.js";

// GET  /api/chat/conversations/:id/messages?after=|before=: the newest 50, older ones (before an id),
//      or only the ones after the last id the screen has (polling).
// POST /api/chat/conversations/:id/messages { body }: send a message.
export default methods({
  GET: async (req, res) => {
    const user = await requireUser(req);
    const q = MessageQuery.parse({ after: queryParam(req, "after"), before: queryParam(req, "before") });
    res.setHeader("Cache-Control", "private, no-store");
    res.status(200).json(await listMessages(db, user, uuidParam(req), q));
  },
  POST: async (req, res) => {
    const user = await requireUser(req);
    res.status(201).json(await sendMessage(db, user, uuidParam(req), SendInput.parse(req.body ?? {}).body));
  },
});
