import { can, requireUser } from "../../lib/auth.js";
import { db } from "../../lib/db.js";
import { HttpError, methods, queryParam } from "../../lib/http.js";
import { syncEnrollments } from "../../lib/academics.js";
import { createOffering, listOfferings, OfferingInput } from "../../lib/offerings.js";

// GET  /api/offerings[?includeDeleted=true]: course offerings (archived ones for admins only). Students
//      get only the offerings they're enrolled in (their own Day/Night school and year level).
// POST /api/offerings: create one, then enroll matching students.
export default methods({
  GET: async (req, res) => {
    const user = await requireUser(req);
    const includeDeleted = queryParam(req, "includeDeleted") === "true";
    if (includeDeleted && !can(user, "offerings:write")) throw new HttpError(403, "Forbidden");
    res.status(200).json(await listOfferings(db, { includeDeleted, forStudent: user.role === "student" ? user.id : undefined }));
  },
  POST: async (req, res) => {
    await requireUser(req, "offerings:write");
    const input = OfferingInput.parse(req.body ?? {});
    const { id, enrolled } = await db.transaction(async (tx) => {
      const id = await createOffering(tx, input);
      return { id, enrolled: await syncEnrollments(tx, { offeringIds: [id] }) };
    });
    const [offering] = await listOfferings(db, { ids: [id] });
    res.status(201).json({ ...offering, newEnrollments: enrolled });
  },
});
