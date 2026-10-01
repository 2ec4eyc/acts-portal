import { requireUser } from "../../../lib/auth.js";
import { db } from "../../../lib/db.js";
import { methods } from "../../../lib/http.js";
import { deleteFiles, DeleteFilesInput } from "../../../lib/receipt-storage.js";

// POST /api/storage/files/delete { ids }: deletes the files of rejected receipts, and of approved ones
// older than the storage setting. The receipts and payments stay (admins).
export default methods({
  POST: async (req, res) => {
    const user = await requireUser(req, "storage:manage");
    res.status(200).json(await deleteFiles(db, user, DeleteFilesInput.parse(req.body ?? {}).ids));
  },
});
