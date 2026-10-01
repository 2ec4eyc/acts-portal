import { requireUser } from "../../lib/auth.js";
import { db } from "../../lib/db.js";
import { methods } from "../../lib/http.js";
import { requestMaterialUpload, UploadUrlInput } from "../../lib/materials.js";

// POST /api/materials/upload-url { offeringId, fileName, contentType, sizeBytes }: where to upload a course
// file: { mode: "r2", key, url } (PUT within 5 minutes, up to 20 MB) or { mode: "db" } without R2.
export default methods({
  POST: async (req, res) => {
    const user = await requireUser(req, "materials:write_own");
    res.status(200).json(await requestMaterialUpload(db, user, UploadUrlInput.parse(req.body ?? {})));
  },
});
