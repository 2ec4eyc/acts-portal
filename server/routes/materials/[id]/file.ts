import { requireUser } from "../../../lib/auth.js";
import { db } from "../../../lib/db.js";
import { methods, uuidParam } from "../../../lib/http.js";
import { getVisibleMaterial, materialDownload } from "../../../lib/materials.js";

// GET /api/materials/:id/file: { url } for links and R2 files (a 5-minute link), or the file itself
// for older files stored in the database. Same visibility rules as the list.
export default methods({
  GET: async (req, res) => {
    const user = await requireUser(req);
    const material = await getVisibleMaterial(db, user, uuidParam(req));
    const d = await materialDownload(db, material.id, material.fileName);
    res.setHeader("Cache-Control", "private, no-store");
    if (d.kind !== "bytes") return res.status(200).json({ url: d.url, link: d.kind === "link" });
    res.setHeader("Content-Type", material.contentType ?? "application/octet-stream");
    res.setHeader("Content-Length", String(d.content.length));
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(material.fileName)}`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.status(200).send(d.content);
  },
});
