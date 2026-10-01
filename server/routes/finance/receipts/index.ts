import { can, requireUser } from "../../../lib/auth.js";
import { db } from "../../../lib/db.js";
import { listReceipts, ReceiptFilter, ReceiptInput, submitReceipt } from "../../../lib/finance.js";
import { methods, queryParam } from "../../../lib/http.js";

// GET  /api/finance/receipts?status=&studentId=: finance staff see all; students their own.
// POST /api/finance/receipts: a student submits a receipt for review (see upload-url).
export default methods({
  GET: async (req, res) => {
    const user = await requireUser(req);
    const f = ReceiptFilter.parse({ status: queryParam(req, "status"), studentId: queryParam(req, "studentId") });
    res.status(200).json(await listReceipts(db, can(user, "finance:read") ? f : { ...f, studentId: user.id }));
  },
  POST: async (req, res) => {
    const user = await requireUser(req);
    res.status(201).json({ id: await submitReceipt(db, user, ReceiptInput.parse(req.body ?? {})) });
  },
});
