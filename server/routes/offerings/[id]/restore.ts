import { requireUser } from "../../../lib/auth.js";
import { db } from "../../../lib/db.js";
import { methods, uuidParam } from "../../../lib/http.js";
import { syncEnrollments } from "../../../lib/academics.js";
import { listOfferings, setOfferingDeleted } from "../../../lib/offerings.js";

// POST /api/offerings/:id/restore: bring an archived offering back.
export default methods({
  POST: async (req, res) => {
    await requireUser(req, "offerings:write");
    const id = uuidParam(req);
    await db.transaction(async (tx) => {
      await setOfferingDeleted(tx, id, null);
      await syncEnrollments(tx, { offeringIds: [id] });
    });
    const [offering] = await listOfferings(db, { ids: [id] });
    res.status(200).json(offering);
  },
});
