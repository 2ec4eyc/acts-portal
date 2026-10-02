import { requireUser } from "../../../lib/auth.js";
import { db } from "../../../lib/db.js";
import { PaymentInput, recordOfficePayment } from "../../../lib/finance.js";
import { methods } from "../../../lib/http.js";

// POST /api/finance/payments { studentId, amount, paidOn, method, reference?, invoiceId? }: a payment
// received at the office; applied to the given invoice first, then the oldest open ones. The student is
// notified and can download their updated statement (finance staff).
export default methods({
  POST: async (req, res) => {
    const user = await requireUser(req, "finance:write");
    res.status(201).json({ id: await recordOfficePayment(db, user, PaymentInput.parse(req.body ?? {})) });
  },
});
