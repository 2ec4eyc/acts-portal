import { requireUser } from "../../../lib/auth.js";
import { db } from "../../../lib/db.js";
import { createTemplate, listTemplates, TemplateInput } from "../../../lib/finance.js";
import { methods } from "../../../lib/http.js";

// GET  /api/finance/templates: saved charge sets, by name (finance staff).
// POST /api/finance/templates { name, description, lines } (finance staff).
export default methods({
  GET: async (req, res) => {
    await requireUser(req, "finance:write");
    res.status(200).json(await listTemplates(db));
  },
  POST: async (req, res) => {
    const user = await requireUser(req, "finance:write");
    res.status(201).json(await createTemplate(db, user, TemplateInput.parse(req.body ?? {})));
  },
});
