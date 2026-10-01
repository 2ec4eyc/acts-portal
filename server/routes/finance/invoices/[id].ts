import { requireUser } from "../../../lib/auth.js";
import { db } from "../../../lib/db.js";
import { assertCanSeeStudent, getInvoice, VoidInput, voidInvoice } from "../../../lib/finance.js";
import { methods, uuidParam } from "../../../lib/http.js";

// GET   /api/finance/invoices/:id: one invoice with its lines (finance staff or its student).
// PATCH /api/finance/invoices/:id { void: { reason } } (finance staff).
export default methods({
  GET: async (req, res) => {
    const user = await requireUser(req);
    const invoice = await getInvoice(db, uuidParam(req));
    assertCanSeeStudent(user, invoice.studentId);
    res.status(200).json(invoice);
  },
  PATCH: async (req, res) => {
    const user = await requireUser(req, "finance:write");
    res.status(200).json(await voidInvoice(db, user, uuidParam(req), VoidInput.parse(req.body ?? {}).void.reason));
  },
});
