import { requireUser } from "../../lib/auth.js";
import { db } from "../../lib/db.js";
import { HttpError, methods } from "../../lib/http.js";
import { describeSetting, isSettingKey, updateSetting } from "../../lib/settings.js";

function keyParam(value: unknown) {
  if (typeof value !== "string" || !isSettingKey(value)) throw new HttpError(404, "Unknown setting");
  return value;
}

// GET   /api/settings/:key: current value and who changed it last (admins).
// PATCH /api/settings/:key: change some fields, e.g. { "chat": false } for "features" (admins).
export default methods({
  GET: async (req, res) => {
    await requireUser(req, "settings:write");
    res.status(200).json(await describeSetting(db, keyParam(req.query.key)));
  },
  PATCH: async (req, res) => {
    const user = await requireUser(req, "settings:write");
    res.status(200).json(await updateSetting(db, keyParam(req.query.key), req.body, user.id));
  },
});
