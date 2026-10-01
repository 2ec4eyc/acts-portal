import { requireUser } from "../../../lib/auth.js";
import { db } from "../../../lib/db.js";
import { methods, queryParam } from "../../../lib/http.js";
import { FileFilter, listFiles } from "../../../lib/receipt-storage.js";

// GET /api/storage/files?status=&q=&deletable=true&sort=newest|largest&offset=: receipt files, 100 at a
// time, each with the reason it can't be deleted (admins).
export default methods({
  GET: async (req, res) => {
    await requireUser(req, "storage:manage");
    const f = FileFilter.parse(Object.fromEntries(
      ["status", "q", "deletable", "sort", "offset"].map((k) => [k, queryParam(req, k)])));
    res.status(200).json(await listFiles(db, f));
  },
});
