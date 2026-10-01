import { requireUser } from "../../lib/auth.js";
import { AuditQuery, listAudit } from "../../lib/audit.js";
import { db } from "../../lib/db.js";
import { methods, queryParam } from "../../lib/http.js";

// GET /api/audit?table=&actorId=&entityId=&from=&to=&before=&limit=: who changed what, newest first (admins).
export default methods({
  GET: async (req, res) => {
    await requireUser(req, "audit:read");
    const q = AuditQuery.parse(Object.fromEntries(
      ["table", "actorId", "entityId", "from", "to", "before", "limit"].map((k) => [k, queryParam(req, k)]),
    ));
    res.setHeader("Cache-Control", "private, no-store");
    res.status(200).json(await listAudit(db, q));
  },
});
