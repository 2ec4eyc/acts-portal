import { z } from "zod";
import { requireUser } from "../../server/lib/auth.js";
import { db } from "../../server/lib/db.js";
import { methods, queryParam } from "../../server/lib/http.js";
import { listProfiles, loadProfile } from "../../server/lib/profiles.js";
import { AccountCreate, createAccount } from "../../server/lib/users.js";

const ListQuery = z.object({
  role: z.enum(["student", "teacher", "admin", "president", "vice_president"]).optional(),
  status: z.enum(["current", "archived", "all"]).default("current"),
});

// GET  /api/users[?role=student][&status=current|archived|all]: accounts (staff only).
// POST /api/users: create a login and account (admins only).
export default methods({
  GET: async (req, res) => {
    await requireUser(req, "users:read");
    const q = ListQuery.parse({ role: queryParam(req, "role"), status: queryParam(req, "status") });
    const statuses = q.status === "current" ? ["active", "pending"] as const
      : q.status === "archived" ? ["archived"] as const : undefined;
    res.status(200).json(await listProfiles(db, { role: q.role, statuses: statuses ? [...statuses] : undefined }));
  },
  POST: async (req, res) => {
    await requireUser(req, "users:admin");
    const id = await createAccount(db, AccountCreate.parse(req.body ?? {}));
    res.status(201).json(await loadProfile(db, id));
  },
});
