import { requireUser } from "../../../../lib/auth.js";
import { db } from "../../../../lib/db.js";
import { assertCanSeeStudent, statement } from "../../../../lib/finance.js";
import { methods, uuidParam } from "../../../../lib/http.js";

// GET /api/finance/students/:id/statement: totals, invoices, payments, receipts and the ledger
// (finance staff, or the student themself).
export default methods({
  GET: async (req, res) => {
    const user = await requireUser(req);
    const id = uuidParam(req);
    assertCanSeeStudent(user, id);
    res.setHeader("Cache-Control", "private, no-store");
    res.status(200).json(await statement(db, id));
  },
});
