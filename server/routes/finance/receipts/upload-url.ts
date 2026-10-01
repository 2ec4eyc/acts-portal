import { requireUser } from "../../../lib/auth.js";
import { db } from "../../../lib/db.js";
import { requestUpload, UploadRequest } from "../../../lib/finance.js";
import { methods } from "../../../lib/http.js";

// POST /api/finance/receipts/upload-url { contentType, sizeBytes, sha256 } → { mode: "r2", key, url }
// (PUT the file to url, then POST /api/finance/receipts with the key) or { mode: "db" } (send the
// file with that POST). Students only.
export default methods({
  POST: async (req, res) => {
    const user = await requireUser(req);
    res.status(200).json(await requestUpload(db, user, UploadRequest.parse(req.body ?? {})));
  },
});
