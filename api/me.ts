import { db } from "../server/lib/db.js";
import { requireUser } from "../server/lib/auth.js";
import { HttpError, methods } from "../server/lib/http.js";
import { applySelfUpdate, loadProfile, SelfProfileUpdate } from "../server/lib/profiles.js";

// GET /api/me: the signed-in user's profile.
// PATCH /api/me: update the user's own editable fields (partial; unknown fields are rejected).
export default methods({
  GET: async (req, res) => {
    const user = await requireUser(req);
    res.status(200).json(await loadProfile(db, user.id));
  },
  PATCH: async (req, res) => {
    const user = await requireUser(req);
    const update = SelfProfileUpdate.parse(req.body ?? {});
    if (update.staffCategory !== undefined && user.role !== "admin") {
      throw new HttpError(403, "Only admins can set a staff category");
    }
    await applySelfUpdate(db, user.id, update);
    res.status(200).json(await loadProfile(db, user.id));
  },
});
