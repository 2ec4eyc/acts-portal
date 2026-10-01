import { requireUser } from "../../../lib/auth.js";
import { db } from "../../../lib/db.js";
import { VoidInput, voidPayment } from "../../../lib/finance.js";
import { methods, uuidParam } from "../../../lib/http.js";

// PATCH /api/finance/payments/:id { void: { reason } } (finance staff).
export default methods({
  PATCH: async (req, res) => {
    const user = await requireUser(req, "finance:write");
    await voidPayment(db, user, uuidParam(req), VoidInput.parse(req.body ?? {}).void.reason);
    res.status(204).end();
  },
});
