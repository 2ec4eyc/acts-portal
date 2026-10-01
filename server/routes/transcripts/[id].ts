import { requireUser } from "../../lib/auth.js";
import { db } from "../../lib/db.js";
import { methods, uuidParam } from "../../lib/http.js";
import { getTranscript } from "../../lib/transcripts.js";

// GET /api/transcripts/:id: an issued transcript with its frozen content.
export default methods({
  GET: async (req, res) => {
    const user = await requireUser(req);
    res.status(200).json(await getTranscript(db, user, uuidParam(req)));
  },
});
