import { requireUser } from "../../../lib/auth.js";
import { db } from "../../../lib/db.js";
import { deleteTemplate, TemplateInput, updateTemplate } from "../../../lib/finance.js";
import { methods, uuidParam } from "../../../lib/http.js";

// PATCH  /api/finance/templates/:id { name, description, lines } (finance staff).
// DELETE /api/finance/templates/:id (finance staff). Invoices already issued are unaffected.
export default methods({
  PATCH: async (req, res) => {
    await requireUser(req, "finance:write");
    res.status(200).json(await updateTemplate(db, uuidParam(req), TemplateInput.parse(req.body ?? {})));
  },
  DELETE: async (req, res) => {
    await requireUser(req, "finance:write");
    await deleteTemplate(db, uuidParam(req));
    res.status(204).end();
  },
});
