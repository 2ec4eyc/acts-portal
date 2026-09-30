import { requireUser } from "../../../server/lib/auth.js";
import { db } from "../../../server/lib/db.js";
import { methods, uuidParam } from "../../../server/lib/http.js";
import { fileContent, getVisibleMaterial } from "../../../server/lib/materials.js";

// GET /api/materials/:id/file: download the file (same visibility rules as the list).
export default methods({
  GET: async (req, res) => {
    const user = await requireUser(req);
    const material = await getVisibleMaterial(db, user, uuidParam(req));
    const content = await fileContent(db, material.id);
    res.setHeader("Content-Type", material.contentType ?? "application/octet-stream");
    res.setHeader("Content-Length", String(content.length));
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(material.fileName)}`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.status(200).send(content);
  },
});
