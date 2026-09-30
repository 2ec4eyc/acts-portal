import { z } from "zod";
import { requireUser } from "../../server/lib/auth.js";
import { db } from "../../server/lib/db.js";
import { methods } from "../../server/lib/http.js";
import { cleanUpRecords } from "../../server/lib/users.js";

const Body = z.strictObject({ studentIds: z.array(z.uuid()).min(1).max(1000) });

// POST /api/users/cleanup { studentIds }: remove these students' enrollments (and grades) in
// archived course offerings. Each removal is recorded in the audit log.
export default methods({
  POST: async (req, res) => {
    const user = await requireUser(req, "users:write");
    const { studentIds } = Body.parse(req.body ?? {});
    res.status(200).json({ removed: await cleanUpRecords(db, studentIds, user.id) });
  },
});
