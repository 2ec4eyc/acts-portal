import { requireUser } from "../../../lib/auth.js";
import { db } from "../../../lib/db.js";
import { studentBalances } from "../../../lib/finance.js";
import { methods } from "../../../lib/http.js";

// GET /api/finance/students: every student with amounts charged, paid and outstanding (finance staff).
export default methods({
  GET: async (req, res) => {
    await requireUser(req, "finance:read");
    res.status(200).json(await studentBalances(db));
  },
});
