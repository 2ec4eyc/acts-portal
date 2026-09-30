import { requireUser } from "../../../server/lib/auth.js";
import { db } from "../../../server/lib/db.js";
import { methods, uuidParam } from "../../../server/lib/http.js";
import { syncEnrollments } from "../../../server/lib/academics.js";
import { listOfferings, setOfferingDeleted } from "../../../server/lib/offerings.js";

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
