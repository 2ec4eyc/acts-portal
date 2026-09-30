import { z } from "zod";
import { requireUser } from "../../lib/auth.js";
import { db } from "../../lib/db.js";
import { methods } from "../../lib/http.js";
import { setArchived } from "../../lib/users.js";

const Body = z.strictObject({ ids: z.array(z.uuid()).min(1).max(1000) });

// POST /api/users/restore { ids }: reactivate archived accounts (admins only).
export default methods({
  POST: async (req, res) => {
    await requireUser(req, "users:admin");
    const { ids } = Body.parse(req.body ?? {});
    await setArchived(db, [...new Set(ids)], false);
    res.status(204).end();
  },
});
