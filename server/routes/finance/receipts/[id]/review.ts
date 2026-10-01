import { requireUser } from "../../../../lib/auth.js";
import { db } from "../../../../lib/db.js";
import { reviewReceipt, ReviewInput } from "../../../../lib/finance.js";
import { methods, uuidParam } from "../../../../lib/http.js";

// POST /api/finance/receipts/:id/review { decision: "approve", amount?, note? } | { decision: "reject", note }
// Approving records the payment (finance staff).
export default methods({
  POST: async (req, res) => {
    const user = await requireUser(req, "finance:write");
    const paymentId = await reviewReceipt(db, user, uuidParam(req), ReviewInput.parse(req.body ?? {}));
    res.status(200).json({ paymentId });
  },
});
