import { z } from "zod";
import { requireUser } from "../../lib/auth.js";
import { db } from "../../lib/db.js";
import { HttpError, methods } from "../../lib/http.js";
import { setArchived } from "../../lib/users.js";

const Body = z.strictObject({ ids: z.array(z.uuid()).min(1).max(1000) });

// POST /api/users/archive { ids }: deactivate accounts (they can no longer sign in) (admins only).
export default methods({
  POST: async (req, res) => {
    const user = await requireUser(req, "users:admin");
    const { ids } = Body.parse(req.body ?? {});
    if (ids.includes(user.id)) throw new HttpError(409, "You cannot archive your own account");
    await setArchived(db, [...new Set(ids)], true);
    res.status(204).end();
  },
});
