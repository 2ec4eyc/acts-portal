import { requireUser } from "../../../lib/auth.js";
import { purgeArchive, PurgeInput } from "../../../lib/chat.js";
import { db } from "../../../lib/db.js";
import { methods } from "../../../lib/http.js";

// POST /api/chat/archive/purge { before, expectedCount }: removes the downloaded messages (admins).
export default methods({
  POST: async (req, res) => {
    const user = await requireUser(req, "chat:admin_inbox");
    res.status(200).json(await purgeArchive(db, user, PurgeInput.parse(req.body ?? {})));
  },
});
