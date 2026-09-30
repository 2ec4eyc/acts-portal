import { z } from "zod";
import { requireUser } from "../../lib/auth.js";
import { db } from "../../lib/db.js";
import { methods, queryParam } from "../../lib/http.js";
import { listProfiles, listProfilesWithGrades, loadProfile } from "../../lib/profiles.js";
import { AccountCreate, createAccount } from "../../lib/users.js";

const ListQuery = z.object({
  role: z.enum(["student", "teacher", "admin", "president", "vice_president"]).optional(),
  status: z.enum(["current", "archived", "all"]).default("current"),
  include: z.enum(["grades"]).optional(),
});

// GET  /api/users[?role=student][&status=current|archived|all][&include=grades]: accounts (staff only).
// POST /api/users: create a login and account (admins only).
export default methods({
  GET: async (req, res) => {
    await requireUser(req, "users:read");
    const q = ListQuery.parse({ role: queryParam(req, "role"), status: queryParam(req, "status"), include: queryParam(req, "include") });
    const statuses = q.status === "current" ? ["active", "pending"] as const
      : q.status === "archived" ? ["archived"] as const : undefined;
    const filter = { role: q.role, statuses: statuses ? [...statuses] : undefined };
    res.status(200).json(q.include === "grades" ? await listProfilesWithGrades(db, filter) : await listProfiles(db, filter));
  },
  POST: async (req, res) => {
    await requireUser(req, "users:admin");
    const id = await createAccount(db, AccountCreate.parse(req.body ?? {}));
    res.status(201).json(await loadProfile(db, id));
  },
});
