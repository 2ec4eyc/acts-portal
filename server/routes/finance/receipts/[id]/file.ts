import { requireUser } from "../../../../lib/auth.js";
import { db } from "../../../../lib/db.js";
import { receiptFile } from "../../../../lib/finance.js";
import { methods, uuidParam } from "../../../../lib/http.js";

// GET /api/finance/receipts/:id/file: { url } (R2: a 5-minute link) or the file itself (database
// storage). The student who uploaded it, or finance staff.
export default methods({
  GET: async (req, res) => {
    const user = await requireUser(req);
    const file = await receiptFile(db, user, uuidParam(req));
    res.setHeader("Cache-Control", "private, no-store");
    if (file.mode === "r2") return res.status(200).json({ url: file.url });
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Length", String(file.content.length));
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.status(200).send(file.content);
  },
});
