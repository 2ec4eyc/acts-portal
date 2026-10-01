import { requireUser } from "../../lib/auth.js";
import { db } from "../../lib/db.js";
import { statement } from "../../lib/finance.js";
import { HttpError, methods } from "../../lib/http.js";

// GET /api/me/finance: the signed-in student's own statement.
export default methods({
  GET: async (req, res) => {
    const user = await requireUser(req);
    if (user.role !== "student") throw new HttpError(404, "Only students have a statement");
    res.setHeader("Cache-Control", "private, no-store");
    res.status(200).json(await statement(db, user.id));
  },
});
