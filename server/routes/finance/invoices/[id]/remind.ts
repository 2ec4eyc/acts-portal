import { requireUser } from "../../../../lib/auth.js";
import { db } from "../../../../lib/db.js";
import { remindInvoice } from "../../../../lib/finance.js";
import { methods, uuidParam } from "../../../../lib/http.js";

// POST /api/finance/invoices/:id/remind: notify the student now (once a day per invoice).
export default methods({
  POST: async (req, res) => {
    const user = await requireUser(req, "finance:write");
    await remindInvoice(db, user, uuidParam(req));
    res.status(204).end();
  },
});
