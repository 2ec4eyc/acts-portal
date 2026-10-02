// The statement of account PDF: built in Node with jsPDF from a sample statement.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { jsPDF } from "jspdf";
import { buildStatementPdf, statementFileName, type StatementForPdf } from "../src/lib/statementPdf.js";

type Statement = StatementForPdf;
type Invoice = Statement["invoices"][number];

const invoice = (n: number, over: Partial<Invoice> = {}): Invoice => ({
  number: `INV-2026-${String(n).padStart(4, "0")}`, description: `Tuition, term ${n}`,
  issuedOn: "2026-08-01", dueOn: "2026-09-01", state: "issued", amount: 6500, paid: 2000, balance: 4500, status: "partially_paid",
  lines: [{ description: "Tuition", amount: 5000 }, { description: "Miscellaneous", amount: 1500 }], ...over,
});
const sample = (invoices: Invoice[]): Statement => ({
  school: "ACTS Bible School", generatedAt: "2026-10-02T04:00:00Z",
  student: { name: "Sam Student", studentNo: "S-001" },
  totals: { charged: 6500, paid: 2000, outstanding: 4500, credit: 0 },
  invoices,
  payments: [
    { amount: 2000, paidOn: "2026-09-10", method: "gcash", reference: "GC-123", voided: false, voidReason: null,
      appliedTo: [{ number: "INV-2026-0001", amount: 2000 }] },
    { amount: 300, paidOn: "2026-09-12", method: "cash", reference: null, voided: true, voidReason: "Duplicate", appliedTo: [] },
  ],
});
/** The text drawn on every page (jsPDF writes uncompressed text operators by default). */
const pdfText = (doc: jsPDF) => doc.output();
/** How jsPDF writes a string inside the PDF: parentheses and backslashes are escaped. */
const escaped = (str: string) => str.replace(/([()\\])/g, "\\$1");

describe("statement of account PDF", () => {
  test("shows the school, student, invoices with their charges, payments and the amount due", () => {
    const doc = buildStatementPdf(sample([invoice(1), invoice(2, { state: "void", status: "void", paid: 0, balance: 0 })]), jsPDF);
    const out = pdfText(doc);
    assert.match(out, /^%PDF-/);
    for (const s of ["ACTS BIBLE SCHOOL", "STATEMENT OF ACCOUNT", "Sam Student", "Student no. S-001", "INV-2026-0001", "Tuition, term 1",
      "- Tuition", "- Miscellaneous", "PHP 5,000.00", "GC-123", "INV-2026-0001 (PHP 2,000.00)", "AMOUNT DUE", "PHP 4,500.00",
      "Partially paid", "VOID (not counted)", "VOID: Duplicate", "Page 1 of 1"]) {
      assert.ok(out.includes(escaped(s)), `missing ${s}`);
    }
  });

  test("long statements run over several pages, each numbered, with headers repeated", () => {
    const doc = buildStatementPdf(sample(Array.from({ length: 40 }, (_, i) => invoice(i + 1))), jsPDF);
    const pages = doc.getNumberOfPages();
    assert.ok(pages >= 3, `pages: ${pages}`);
    const out = pdfText(doc);
    for (let i = 1; i <= pages; i++) assert.ok(out.includes(`Page ${i} of ${pages}`), `page ${i}`);
    assert.ok((out.match(/\(Balance\)/g) ?? []).length >= 2, "invoice table header repeats");
  });

  test("file name uses the student no. and the Manila date", () => {
    assert.equal(statementFileName(sample([])), "statement-S-001-2026-10-02.pdf");
    assert.equal(statementFileName({ ...sample([]), student: { name: "Rita Reyes", studentNo: null } }), "statement-Rita-Reyes-2026-10-02.pdf");
  });
});
