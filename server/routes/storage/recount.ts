import { requireUser } from "../../lib/auth.js";
import { db } from "../../lib/db.js";
import { methods } from "../../lib/http.js";
import { recount } from "../../lib/receipt-storage.js";

// POST /api/storage/recount: lists the R2 bucket, removes orphaned uploads and saves the real total
// (admins; at most once a minute, otherwise the last count is returned).
export default methods({
  POST: async (req, res) => {
    await requireUser(req, "storage:manage");
    res.status(200).json(await recount(db));
  },
});
