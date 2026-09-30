import { db } from "../lib/db.js";
import { requireUser } from "../lib/auth.js";
import { HttpError, methods, queryParam } from "../lib/http.js";
import { applySelfUpdate, listProfilesWithGrades, loadProfile, SelfProfileUpdate } from "../lib/profiles.js";

// GET /api/me[?include=grades]: the signed-in user's profile (optionally with their grades).
// PATCH /api/me: update the user's own editable fields (partial; unknown fields are rejected).
export default methods({
  GET: async (req, res) => {
    const user = await requireUser(req);
    if (queryParam(req, "include") === "grades") {
      const [profile] = await listProfilesWithGrades(db, { ids: [user.id] });
      return res.status(200).json(profile);
    }
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
