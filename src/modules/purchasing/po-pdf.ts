import "server-only";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { PO_STATUS_LABEL, orderedValue } from "./po-math";

/**
 * A purchase order as an A4 PDF, built only from the saved order: the quantities and unit costs on its lines, never the current
 * inventory costs. A line with no unit cost is "Not priced" (never Rs. 0.00), and the order total is shown only when every line is priced.
 */

export interface PoPdfSource {
  businessName: string;
  number: string;
  status: keyof typeof PO_STATUS_LABEL;
  createdAt: Date;
  orderedAt: Date | null;
  expectedDate: Date | null;
  notes: string | null;
  supplier: { name: string; contactPerson: string | null; phone: string | null; email: string | null; address: string | null; gstin: string | null };
  lines: { name: string; unit: string; quantity: number; receivedQuantity: number; unitCost: number }[];
}

type Rgb = [number, number, number];
const PRIMARY: Rgb = [255, 105, 0];
const TEXT: Rgb = [17, 24, 39];
const MUTED: Rgb = [107, 114, 128];
const BORDER: Rgb = [229, 231, 235];
const BAR: Rgb = [243, 244, 246];

// The standard PDF font has no ₹ glyph, so INR is written "Rs.".
const money = (n: number) => `Rs. ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const quantity = (n: number, unit: string) => `${n.toLocaleString("en-IN", { maximumFractionDigits: 3 })} ${unit}`;
/** A timestamp is a moment, shown as the calendar day in India; a date-only column (expected delivery) is shown as stored. */
const day = (d: Date, timeZone: "Asia/Kolkata" | "UTC") => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone });

const LEFT = 40;
const RIGHT = 555;
const BOTTOM = 790;

/** What the PDF says about the money: per-line figures only for priced lines, and a total only when nothing is unpriced. */
export function poPricing(lines: PoPdfSource["lines"]) {
  const pricedLines = lines.filter((l) => l.unitCost > 0).length;
  return { anyPriced: pricedLines > 0, allPriced: pricedLines === lines.length && lines.length > 0, total: pricedLines === lines.length && lines.length > 0 ? orderedValue(lines) : null };
}

export function renderPurchaseOrderPdf(po: PoPdfSource): Uint8Array {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const color = (c: Rgb) => doc.setTextColor(c[0], c[1], c[2]);
  const pricing = poPricing(po.lines);
  const showReceived = po.status === "PARTIALLY_RECEIVED" || po.status === "RECEIVED";
  let y = 50;
  const ensure = (needed: number) => {
    if (y + needed > BOTTOM) {
      doc.addPage();
      y = 50;
    }
  };

  // --- Header: the business on the left, the document title and number on the right ---
  doc.setFont("helvetica", "bold").setFontSize(20);
  color(TEXT);
  doc.text(doc.splitTextToSize(po.businessName, 280) as string[], LEFT, y + 10);
  doc.setFontSize(22).text("Purchase Order", RIGHT, y + 10, { align: "right" });
  const meta: [string, string][] = [
    ["PO #:", po.number],
    ["Date:", day(po.createdAt, "Asia/Kolkata")],
    ...(po.orderedAt ? ([["Ordered on:", day(po.orderedAt, "Asia/Kolkata")]] as [string, string][]) : []),
    ...(po.expectedDate ? ([["Expected:", day(po.expectedDate, "UTC")]] as [string, string][]) : []),
    ["Status:", PO_STATUS_LABEL[po.status]],
  ];
  meta.forEach(([label, value], i) => {
    const my = y + 30 + i * 14;
    doc.setFont("helvetica", "normal").setFontSize(10);
    color(MUTED);
    doc.text(label, 440, my, { align: "right" });
    color(TEXT);
    doc.setFont("helvetica", "bold").text(value, RIGHT, my, { align: "right" });
  });
  y += 30 + meta.length * 14 + 4;
  doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]).setLineWidth(0.8).line(LEFT, y, RIGHT, y);
  y += 18;

  // --- Supplier ---
  doc.setFont("helvetica", "bold").setFontSize(9);
  color(MUTED);
  doc.text("SUPPLIER", LEFT, y);
  y += 15;
  doc.setFontSize(13);
  color(TEXT);
  doc.text(doc.splitTextToSize(po.supplier.name, RIGHT - LEFT) as string[], LEFT, y);
  y += 16;
  doc.setFont("helvetica", "normal").setFontSize(10);
  const details = [po.supplier.contactPerson && `Contact: ${po.supplier.contactPerson}`, po.supplier.phone && `Phone: ${po.supplier.phone}`, po.supplier.email && `Email: ${po.supplier.email}`, po.supplier.address && `Address: ${po.supplier.address}`, po.supplier.gstin && `GSTIN: ${po.supplier.gstin}`].filter((l): l is string => Boolean(l));
  for (const detail of details) {
    const wrapped = doc.splitTextToSize(detail, RIGHT - LEFT) as string[];
    ensure(wrapped.length * 13);
    doc.text(wrapped, LEFT, y);
    y += wrapped.length * 13;
  }
  y += 12;

  // --- Items: the table wraps long names and repeats its header on every page ---
  autoTable(doc, {
    startY: y,
    margin: { left: LEFT, right: 595 - RIGHT, bottom: 50 },
    theme: "grid",
    head: [["#", "Item", "Ordered", ...(showReceived ? ["Received"] : []), ...(pricing.anyPriced ? ["Unit cost", "Amount"] : [])]],
    body: po.lines.map((l, i) => [
      String(i + 1),
      l.name,
      quantity(l.quantity, l.unit),
      ...(showReceived ? [quantity(l.receivedQuantity, l.unit)] : []),
      ...(pricing.anyPriced ? (l.unitCost > 0 ? [money(l.unitCost), money(l.quantity * l.unitCost)] : ["Not priced", "Not priced"]) : []),
    ]),
    styles: { font: "helvetica", fontSize: 10, cellPadding: 6, textColor: TEXT, lineColor: BORDER, lineWidth: 0.5, overflow: "linebreak" },
    headStyles: { fillColor: BAR, textColor: TEXT, fontStyle: "bold" },
    // Fixed widths for the numbers so "Rs. 1,110.00" never breaks across two lines; the item name takes the rest and wraps.
    columnStyles: {
      0: { cellWidth: 28, halign: "center" },
      2: { halign: "right", cellWidth: 72 },
      ...(showReceived ? { 3: { halign: "right", cellWidth: 72 } } : {}),
      ...(pricing.anyPriced ? { [showReceived ? 4 : 3]: { halign: "right", cellWidth: 80 }, [showReceived ? 5 : 4]: { halign: "right", cellWidth: 88 } } : {}),
    },
    didParseCell: (data) => {
      if (data.section === "head" && data.column.index >= 2) data.cell.styles.halign = "right";
    },
    rowPageBreak: "avoid",
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;

  // --- Total, or why there is none ---
  ensure(40);
  doc.setFontSize(10);
  if (pricing.total !== null) {
    doc.setFont("helvetica", "bold").setFontSize(12);
    color(TEXT);
    doc.text(`Order total: ${money(pricing.total)}`, RIGHT, y, { align: "right" });
    y += 18;
  } else {
    doc.setFont("helvetica", "italic").setFontSize(9);
    color(MUTED);
    const note = pricing.anyPriced ? "Total not shown: some items are not priced yet. The actual cost is entered when the stock is received." : "Not yet priced. The actual cost is entered when the stock is received.";
    doc.text(doc.splitTextToSize(note, RIGHT - LEFT) as string[], LEFT, y);
    y += 22;
  }

  // --- Notes ---
  if (po.notes?.trim()) {
    const wrapped = doc.splitTextToSize(po.notes.trim(), RIGHT - LEFT) as string[];
    ensure(30);
    doc.setFont("helvetica", "bold").setFontSize(9);
    color(MUTED);
    doc.text("NOTES", LEFT, y);
    y += 14;
    doc.setFont("helvetica", "normal").setFontSize(10);
    color(TEXT);
    for (const line of wrapped) {
      ensure(13);
      doc.text(line, LEFT, y);
      y += 13;
    }
  }

  // --- Footer on every page ---
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal").setFontSize(8.5);
    color(MUTED);
    const label = "Powered by ";
    const startX = (595 - doc.getTextWidth(label) - doc.setFont("helvetica", "bold").getTextWidth("Platterly")) / 2;
    doc.setFont("helvetica", "normal").text(label, startX, 818);
    color(PRIMARY);
    doc.setFont("helvetica", "bold").text("Platterly", startX + doc.setFont("helvetica", "normal").getTextWidth(label), 818);
    color(MUTED);
    doc.setFont("helvetica", "normal").text(`${po.number} · Page ${p} of ${pages}`, RIGHT, 818, { align: "right" });
  }
  return new Uint8Array(doc.output("arraybuffer"));
}
