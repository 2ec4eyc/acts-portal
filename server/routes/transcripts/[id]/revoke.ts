import { requireUser } from "../../../lib/auth.js";
import { db } from "../../../lib/db.js";
import { methods, uuidParam } from "../../../lib/http.js";
import { getTranscript, RevokeInput, revokeTranscript } from "../../../lib/transcripts.js";

// POST /api/transcripts/:id/revoke { reason }: verification then reports it as revoked (admins).
export default methods({
  POST: async (req, res) => {
    const user = await requireUser(req, "transcripts:issue");
    const id = uuidParam(req);
    await revokeTranscript(db, user, id, RevokeInput.parse(req.body ?? {}).reason);
    res.status(200).json(await getTranscript(db, user, id));
  },
});
