import { requireUser } from "../../../lib/auth.js";
import { db } from "../../../lib/db.js";
import { createInvoices, InvoiceFilter, InvoiceInput, listInvoices } from "../../../lib/finance.js";
import { methods, queryParam } from "../../../lib/http.js";

// GET  /api/finance/invoices?studentId=&status=paid|partially_paid|pending|overdue|void|open (finance staff).
// POST /api/finance/invoices { studentIds, description, dueOn, lines }: one invoice per student (finance staff).
export default methods({
  GET: async (req, res) => {
    await requireUser(req, "finance:read");
    res.status(200).json(await listInvoices(db, InvoiceFilter.parse({ studentId: queryParam(req, "studentId"), status: queryParam(req, "status") })));
  },
  POST: async (req, res) => {
    const user = await requireUser(req, "finance:write");
    const ids = await createInvoices(db, user, InvoiceInput.parse(req.body ?? {}));
    res.status(201).json({ created: ids.length, ids });
  },
});
