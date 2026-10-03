import "server-only";
import { jsPDF } from "jspdf";

type PdfInvoice = {
  type: "INVOICE" | "RECEIPT";
  number: string;
  issueDate: Date;
  dueDate: Date | null;
  customerName: string;
  customerPhone: string | null;
  customerAddress: string | null;
  businessName: string;
  businessAddress: string | null;
  businessGstNumber: string | null;
  gstEnabled: boolean;
  gstType: "CGST_SGST" | "IGST";
  gstRate: unknown;
  taxableValue: unknown;
  cgst: unknown;
  sgst: unknown;
  igst: unknown;
  total: unknown;
  terms: string | null;
  notes: string | null;
  items: { description: string; detail: string | null; hsnSac: string | null; quantity: unknown; rate: unknown; amount: unknown }[];
};

// The design system's colours (globals.css), as RGB for the PDF.
const PRIMARY: [number, number, number] = [255, 105, 0];
const TEXT: [number, number, number] = [17, 24, 39];
const MUTED: [number, number, number] = [107, 114, 128];
const BORDER: [number, number, number] = [229, 231, 235];
const TINT: [number, number, number] = [255, 247, 237];

// The standard PDF font has no ₹ glyph, so INR is written "Rs.".
const money = (n: unknown) => `Rs. ${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** An invoice or receipt as an A4 PDF: the same layout as the invoice page, Terms & Conditions at the foot. */
export function renderInvoicePdf(invoice: PdfInvoice): Uint8Array {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const left = 40;
  const right = 555;
  const color = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);
  const rule = (y: number) => doc.setDrawColor(...BORDER).setLineWidth(1).line(left, y, right, y);
  let y = 56;
  const ensure = (needed: number) => {
    if (y + needed > 790) {
      doc.addPage();
      y = 56;
    }
  };

  doc.setFont("helvetica", "bold").setFontSize(18);
  color(TEXT);
  doc.text(invoice.businessName, left, y);
  doc.setFontSize(16);
  color(PRIMARY);
  doc.text(invoice.type === "RECEIPT" ? "RECEIPT" : "INVOICE", right, y, { align: "right" });
  y += 18;
  doc.setFont("helvetica", "normal").setFontSize(10);
  color(MUTED);
  if (invoice.businessAddress) doc.text(doc.splitTextToSize(invoice.businessAddress, 280), left, y);
  doc.text(invoice.number, right, y, { align: "right" });
  y += 14;
  if (invoice.businessGstNumber) doc.text(`GSTIN ${invoice.businessGstNumber}`, left, y);
  doc.text(`Issued ${date(invoice.issueDate)}`, right, y, { align: "right" });
  y += 14;
  if (invoice.dueDate && invoice.type === "INVOICE") doc.text(`Due ${date(invoice.dueDate)}`, right, y, { align: "right" });
  y += 20;
  rule(y);
  y += 22;

  doc.setFont("helvetica", "bold").setFontSize(8);
  color(MUTED);
  doc.text("BILLED TO", left, y);
  y += 14;
  doc.setFont("helvetica", "bold").setFontSize(12);
  color(TEXT);
  doc.text(invoice.customerName, left, y);
  doc.setFont("helvetica", "normal").setFontSize(10);
  color(MUTED);
  y += 14;
  if (invoice.customerPhone) {
    doc.text(invoice.customerPhone, left, y);
    y += 13;
  }
  if (invoice.customerAddress) {
    const lines = doc.splitTextToSize(invoice.customerAddress, 300) as string[];
    doc.text(lines, left, y);
    y += lines.length * 12;
  }
  y += 16;

  // Items table
  doc.setFillColor(...TINT).rect(left, y, right - left, 22, "F");
  doc.setFont("helvetica", "bold").setFontSize(8);
  color(MUTED);
  const cols = invoice.gstEnabled ? { item: left + 8, hsn: 320, qty: 385, rate: 460, amt: right - 8 } : { item: left + 8, hsn: 0, qty: 385, rate: 460, amt: right - 8 };
  doc.text("ITEM", cols.item, y + 14);
  if (invoice.gstEnabled) doc.text("HSN/SAC", cols.hsn, y + 14, { align: "left" });
  doc.text("QTY", cols.qty, y + 14, { align: "right" });
  doc.text("RATE", cols.rate, y + 14, { align: "right" });
  doc.text("AMOUNT", cols.amt, y + 14, { align: "right" });
  y += 22;
  doc.setFont("helvetica", "normal").setFontSize(10);
  for (const item of invoice.items) {
    const title = doc.splitTextToSize(item.description, invoice.gstEnabled ? 240 : 300) as string[];
    const rowHeight = title.length * 12 + (item.detail ? 12 : 0) + 12;
    ensure(rowHeight);
    color(TEXT);
    doc.text(title, cols.item, y + 14);
    if (item.detail) {
      color(MUTED);
      doc.setFontSize(8.5).text(item.detail, cols.item, y + 14 + title.length * 12 - 1).setFontSize(10);
    }
    color(TEXT);
    if (invoice.gstEnabled && item.hsnSac) doc.text(item.hsnSac, cols.hsn, y + 14);
    doc.text(Number(item.quantity).toLocaleString("en-IN"), cols.qty, y + 14, { align: "right" });
    doc.text(money(item.rate), cols.rate, y + 14, { align: "right" });
    doc.text(money(item.amount), cols.amt, y + 14, { align: "right" });
    y += rowHeight;
    rule(y);
  }
  y += 18;

  // Totals
  const line = (label: string, value: string, bold = false) => {
    ensure(18);
    doc.setFont("helvetica", bold ? "bold" : "normal").setFontSize(bold ? 12 : 10);
    color(bold ? TEXT : MUTED);
    doc.text(label, 360, y);
    color(TEXT);
    doc.text(value, right - 8, y, { align: "right" });
    y += bold ? 20 : 16;
  };
  if (invoice.gstEnabled) {
    line("Taxable value", money(invoice.taxableValue));
    if (invoice.gstType === "IGST") line(`IGST ${Number(invoice.gstRate)}%`, money(invoice.igst));
    else {
      line(`CGST ${Number(invoice.gstRate) / 2}%`, money(invoice.cgst));
      line(`SGST ${Number(invoice.gstRate) / 2}%`, money(invoice.sgst));
    }
  }
  doc.setFillColor(...TINT).rect(350, y - 14, right - 350, 26, "F");
  line("Total", money(invoice.total), true);
  y += 8;
  if (invoice.gstEnabled) {
    color(MUTED);
    doc.setFont("helvetica", "normal").setFontSize(8.5).text("Prices include GST.", right - 8, y - 6, { align: "right" });
    y += 10;
  }

  if (invoice.notes) {
    ensure(30);
    color(MUTED);
    doc.setFont("helvetica", "normal").setFontSize(9).text(doc.splitTextToSize(invoice.notes, right - left), left, y);
    y += 24;
  }

  // Terms & Conditions from Invoice Settings, at the foot.
  if (invoice.terms) {
    const termLines = doc.splitTextToSize(invoice.terms, right - left) as string[];
    ensure(24 + termLines.length * 11);
    y += 6;
    doc.setDrawColor(...BORDER).setLineDashPattern([3, 3], 0).line(left, y, right, y).setLineDashPattern([], 0);
    y += 16;
    doc.setFont("helvetica", "bold").setFontSize(10);
    color(TEXT);
    doc.text("Terms & Conditions", left, y);
    y += 14;
    doc.setFont("helvetica", "normal").setFontSize(9);
    color(MUTED);
    doc.text(termLines, left, y);
  }
  return new Uint8Array(doc.output("arraybuffer"));
}
