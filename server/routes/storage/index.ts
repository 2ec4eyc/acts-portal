import { requireUser } from "../../lib/auth.js";
import { db } from "../../lib/db.js";
import { methods } from "../../lib/http.js";
import { usage } from "../../lib/receipt-storage.js";

// GET /api/storage: how much space receipt files use, the limits and the alert level (admins).
export default methods({
  GET: async (req, res) => {
    await requireUser(req, "storage:manage");
    res.setHeader("Cache-Control", "private, no-store");
    res.status(200).json(await usage(db));
  },
});
