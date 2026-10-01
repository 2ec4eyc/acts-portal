import { can, requireUser } from "../../lib/auth.js";
import { db } from "../../lib/db.js";
import { HttpError, methods, queryParam, uuidParam } from "../../lib/http.js";
import { listProfilesWithGrades, loadProfile } from "../../lib/profiles.js";
import { AccountUpdate, deleteAccount, getUserRow, updateAccount } from "../../lib/users.js";

// GET    /api/users/:id[?include=grades]: one account (staff, or the user themself).
// PATCH  /api/users/:id: edit an account. Executives may edit student accounts; staff accounts,
//        roles, emails and staff categories need an admin.
// DELETE /api/users/:id: permanently delete an archived account (admins only).
export default methods({
  GET: async (req, res) => {
    const user = await requireUser(req);
    const id = uuidParam(req);
    if (id !== user.id && !can(user, "users:read")) throw new HttpError(403, "Forbidden");
    const profile = queryParam(req, "include") === "grades"
      ? (await listProfilesWithGrades(db, { ids: [id] }))[0]
      : await loadProfile(db, id);
    if (!profile) throw new HttpError(404, "User not found");
    res.status(200).json(profile);
  },
  PATCH: async (req, res) => {
    const user = await requireUser(req, "users:write");
    const target = await getUserRow(db, uuidParam(req));
    const input = AccountUpdate.parse(req.body ?? {});
    const needsAdmin = target.role !== "student"
      || input.role !== undefined || input.email !== undefined || input.staffCategory !== undefined;
    if (needsAdmin && !can(user, "users:admin")) {
      throw new HttpError(403, "Only admins can edit staff accounts, roles or email addresses");
    }
    if (target.status === "archived" && input.status !== undefined) {
      throw new HttpError(409, "Restore the account instead of changing its status");
    }
    await updateAccount(db, target, input);
    res.status(200).json(await loadProfile(db, target.id));
  },
  DELETE: async (req, res) => {
    const user = await requireUser(req, "users:admin");
    const target = await getUserRow(db, uuidParam(req));
    if (target.id === user.id) throw new HttpError(409, "You cannot delete your own account");
    await deleteAccount(db, target);
    res.status(204).end();
  },
});
