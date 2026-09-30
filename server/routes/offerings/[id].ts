import { requireUser, can } from "../../lib/auth.js";
import { db } from "../../lib/db.js";
import { HttpError, methods, uuidParam } from "../../lib/http.js";
import { syncEnrollments } from "../../lib/academics.js";
import { listOfferings, OfferingInput, setOfferingDeleted, updateOffering } from "../../lib/offerings.js";

// GET    /api/offerings/:id
// PATCH  /api/offerings/:id: partial update, then enroll matching students.
// DELETE /api/offerings/:id: archive (soft delete; restore with POST /api/offerings/:id/restore).
export default methods({
  GET: async (req, res) => {
    const user = await requireUser(req);
    const [offering] = await listOfferings(db, { ids: [uuidParam(req)], includeDeleted: can(user, "offerings:write") });
    if (!offering) throw new HttpError(404, "Offering not found");
    res.status(200).json(offering);
  },
  PATCH: async (req, res) => {
    await requireUser(req, "offerings:write");
    const id = uuidParam(req);
    const input = OfferingInput.partial().parse(req.body ?? {});
    const enrolled = await db.transaction(async (tx) => {
      await updateOffering(tx, id, input);
      return syncEnrollments(tx, { offeringIds: [id] });
    });
    const [offering] = await listOfferings(db, { ids: [id], includeDeleted: true });
    res.status(200).json({ ...offering, newEnrollments: enrolled });
  },
  DELETE: async (req, res) => {
    const user = await requireUser(req, "offerings:write");
    await setOfferingDeleted(db, uuidParam(req), user.id);
    res.status(204).end();
  },
});
