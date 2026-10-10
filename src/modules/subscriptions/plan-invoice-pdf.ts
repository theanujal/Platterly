import { jsPDF } from "jspdf";

type Rgb = [number, number, number];

// The design system's colours (globals.css), as RGB for the PDF.
const ORANGE: Rgb = [255, 105, 0];
const ORANGE_TINT: Rgb = [255, 247, 237];
const ORANGE_BORDER: Rgb = [254, 215, 170];
const SUCCESS: Rgb = [22, 163, 74];
const SUCCESS_TINT: Rgb = [232, 246, 237];
const TEXT: Rgb = [17, 24, 39];
const MUTED: Rgb = [107, 114, 128];
const BORDER: Rgb = [229, 231, 235];
const GRAY: Rgb = [243, 244, 246];

/** The one document Platterly sends a kitchen for its plan: a paid tax invoice, or the invoice for a free trial. */
export const PRODUCT_NAME = "Platterly Catering";

export interface PlanInvoiceData {
  /** public/platterly-logo.png, read by the caller (jsPDF cannot draw the SVG). */
  logo: Uint8Array;
  invoiceNumber: string;
  date: string;
  /** The product the plan is for ("Platterly Catering"), printed in the header. */
  productName: string;
  /** "PAID" or "TRIAL": the pill under INVOICE. */
  statusLabel: string;
  seller: { name: string; lines: string[]; gstin: string | null; pan: string | null; sac: string | null; email: string | null; phone: string | null } | null;
  billedTo: { name: string; lines: string[]; gstin: string | null };
  planName: string;
  planStatus: string;
  subscriptionRef: string;
  term: string;
  period: string;
  paymentMethod: string;
  transactionId: string;
  features: string[];
  /** Money is already formatted ("Rs. 3,000.00"): the standard PDF font has no rupee glyph. */
  amount: string;
  taxLines: { label: string; amount: string }[];
  total: string;
  totalLabel: string;
  paymentNote: string;
  footerNote: string | null;
}

const PAGE_BOTTOM = 800;

/** Draws the plan invoice (A4) and returns the PDF bytes. Pure: no database, no files, so it is easy to test. */
export function renderPlanInvoicePdf(data: PlanInvoiceData): ArrayBuffer {
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  doc.setProperties({ title: `Invoice ${data.invoiceNumber}`, author: "Platterly" });
  const left = 40;
  const right = 555;
  const width = right - left;
  const fill = (c: Rgb) => doc.setFillColor(c[0], c[1], c[2]);
  const stroke = (c: Rgb, w = 0.8) => doc.setDrawColor(c[0], c[1], c[2]).setLineWidth(w);
  const ink = (c: Rgb) => doc.setTextColor(c[0], c[1], c[2]);
  const font = (weight: "bold" | "normal", size: number) => doc.setFont("helvetica", weight).setFontSize(size);
  const wrap = (value: string, maxWidth: number, weight: "bold" | "normal", size: number) => {
    font(weight, size);
    return doc.splitTextToSize(value, maxWidth) as string[];
  };

  // ---------- Header: the logo, and the invoice's own facts ----------
  doc.addImage(data.logo, "PNG", left, 38, 150, 150 * (67.66 / 300.18), "platterly-logo", "FAST");
  font("normal", 6.5);
  ink(MUTED);
  doc.text("CATERING MANAGEMENT PLATFORM", left + 2, 90, { charSpace: 1.6 });

  if (data.seller) {
    const s = data.seller;
    const rows = [
      wrap(s.name, 262, "bold", 8.5),
      ...[
        [...s.lines].join(", "),
        [s.gstin ? `GSTIN: ${s.gstin}` : "", s.pan ? `PAN: ${s.pan}` : "", s.sac ? `SAC: ${s.sac}` : ""].filter(Boolean).join("  |  "),
        [s.email, s.phone].filter(Boolean).join("  |  "),
      ]
        .filter(Boolean)
        .map((l) => wrap(l, 262, "normal", 7.5)),
    ];
    let sy = 108;
    rows.forEach((lines, i) => {
      font(i === 0 ? "bold" : "normal", i === 0 ? 8.5 : 7.5);
      ink(i === 0 ? TEXT : MUTED);
      for (const line of lines) {
        doc.text(line, left + 2, sy);
        sy += 10;
      }
    });
  }

  stroke(ORANGE, 1.2);
  doc.line(325, 36, 325, 150);
  font("bold", 28);
  ink(TEXT);
  doc.text("INVOICE", 342, 62);
  const pillWidth = 22 + doc.getTextWidth(data.statusLabel) + 12;
  fill(SUCCESS_TINT);
  doc.roundedRect(342, 72, pillWidth, 20, 10, 10, "F");
  fill(SUCCESS);
  doc.circle(354, 82, 5.5, "F");
  stroke([255, 255, 255], 1.3);
  doc.lines([[2, 2], [3.4, -3.8]], 351.4, 82.2, [1, 1], "S");
  font("bold", 9);
  ink(SUCCESS);
  doc.text(data.statusLabel, 366, 85.5);
  const meta: [string, string][] = [
    ["Invoice #:", data.invoiceNumber],
    ["Date:", data.date],
    ["Invoice Type:", "Subscription"],
    ["Product:", data.productName],
  ];
  meta.forEach(([label, value], i) => {
    const y = 112 + i * 14;
    font("normal", 9);
    ink(MUTED);
    doc.text(label, 342, y);
    font("bold", 9);
    ink(TEXT);
    doc.text(value, 418, y, { maxWidth: right - 418 });
  });

  // ---------- Billed to / Plan ----------
  const cardGap = 12;
  const cardWidth = (width - cardGap) / 2;
  const cardTop = 164;
  const textWidth = cardWidth - 24;
  const toName = wrap(data.billedTo.name, textWidth, "bold", 10.5);
  const toBody = [...data.billedTo.lines, ...(data.billedTo.gstin ? [`GSTIN: ${data.billedTo.gstin}`] : [])].flatMap((l) => wrap(l, textWidth, "normal", 8.5));
  const cardHeight = Math.max(84, 34 + toName.length * 13 + toBody.length * 11 + 10);
  fill(ORANGE_TINT);
  stroke(ORANGE_BORDER, 0.6);
  doc.roundedRect(left, cardTop, cardWidth, cardHeight, 6, 6, "FD");
  font("bold", 8);
  ink(MUTED);
  doc.text("BILLED TO", left + 12, cardTop + 18);
  ink(TEXT);
  font("bold", 10.5);
  doc.text(toName, left + 12, cardTop + 36);
  let by = cardTop + 36 + (toName.length - 1) * 13 + 14;
  font("normal", 8.5);
  ink(MUTED);
  for (const line of toBody) {
    doc.text(line, left + 12, by);
    by += 11;
  }

  // The plan card: a crown, the plan's name and its state.
  const planX = left + cardWidth + cardGap;
  fill(ORANGE_TINT);
  stroke(ORANGE_BORDER, 0.6);
  doc.roundedRect(planX, cardTop, cardWidth, cardHeight, 6, 6, "FD");
  font("bold", 8);
  ink(MUTED);
  doc.text("SUBSCRIPTION PLAN", planX + 12, cardTop + 18);
  fill([255, 237, 213]);
  doc.circle(planX + 30, cardTop + 52, 17, "F");
  fill(ORANGE);
  doc.lines([[0, -10], [5, 6], [5, -9], [5, 9], [5, -6], [0, 10], [-20, 0]], planX + 20, cardTop + 56, [1, 1], "F", true);
  const planNameLines = wrap(data.planName, cardWidth - 66, "bold", 11);
  font("bold", 11);
  ink(TEXT);
  doc.text(planNameLines, planX + 54, cardTop + 48);
  const planY = cardTop + 48 + (planNameLines.length - 1) * 12;
  const stateWidth = doc.setFont("helvetica", "bold").setFontSize(7.5).getTextWidth(data.planStatus) + 14;
  fill(SUCCESS_TINT);
  doc.roundedRect(planX + 54, planY + 6, stateWidth, 14, 7, 7, "F");
  font("bold", 7.5);
  ink(SUCCESS);
  doc.text(data.planStatus, planX + 61, planY + 16);
  font("normal", 7.5);
  ink(MUTED);
  doc.text(`Subscription ID: #${data.subscriptionRef}`, planX + 54, planY + 34);

  let y = cardTop + cardHeight + 14;

  const ensure = (height: number) => {
    if (y + height > PAGE_BOTTOM) {
      doc.addPage();
      y = 48;
    }
  };
  const panel = (title: string, height: number, aside?: string) => {
    fill(GRAY);
    stroke(BORDER, 0.8);
    doc.roundedRect(left, y, width, height, 6, 6, "S");
    doc.roundedRect(left, y, width, 30, 6, 6, "FD");
    fill(GRAY);
    doc.rect(left + 0.5, y + 22, width - 1, 8, "F");
    stroke(BORDER, 0.8);
    doc.line(left, y + 30, right, y + 30);
    font("bold", 12);
    ink(TEXT);
    doc.text(title, left + 16, y + 20);
    if (aside) {
      font("normal", 8);
      ink(MUTED);
      doc.text(aside, right - 16, y + 19, { align: "right" });
    }
  };
  const icon = (kind: "calendar" | "clock" | "card" | "hash", cx: number, cy: number) => {
    fill(GRAY);
    doc.circle(cx, cy, 14, "F");
    stroke(TEXT, 1.1);
    if (kind === "calendar") {
      doc.roundedRect(cx - 6, cy - 5, 12, 11, 1.5, 1.5, "S");
      doc.line(cx - 6, cy - 1, cx + 6, cy - 1);
      doc.line(cx - 3, cy - 7, cx - 3, cy - 4);
      doc.line(cx + 3, cy - 7, cx + 3, cy - 4);
    } else if (kind === "clock") {
      doc.circle(cx, cy, 6.5, "S");
      doc.line(cx, cy, cx, cy - 3.8);
      doc.line(cx, cy, cx + 3, cy + 1.5);
    } else if (kind === "card") {
      doc.roundedRect(cx - 7, cy - 5, 14, 10, 1.5, 1.5, "S");
      doc.line(cx - 7, cy - 1.5, cx + 7, cy - 1.5);
    } else {
      font("bold", 13);
      ink(TEXT);
      doc.text("#", cx, cy + 4.5, { align: "center" });
    }
  };

  // ---------- Subscription Details ----------
  ensure(110);
  panel("Subscription Details", 84);
  fill([255, 255, 255]);
  const cells: ["calendar" | "clock" | "card" | "hash", string, string][] = [
    ["calendar", "Billing Period", data.period],
    ["clock", "Plan Term", data.term],
    ["card", "Payment Method", data.paymentMethod],
    ["hash", "Transaction ID", data.transactionId],
  ];
  const cellWidth = width / 4;
  cells.forEach(([kind, label, value], i) => {
    const x = left + i * cellWidth;
    if (i > 0) {
      stroke(BORDER, 0.8);
      doc.line(x, y + 40, x, y + 74);
    }
    icon(kind, x + 26, y + 56);
    font("bold", 8);
    ink(MUTED);
    doc.text(label, x + 46, y + 48);
    font("normal", 8);
    ink(TEXT);
    doc.text(wrap(value || "-", cellWidth - 54, "normal", 8).slice(0, 3), x + 46, y + 60);
  });
  y += 84 + 12;

  // ---------- Features Included ----------
  if (data.features.length > 0) {
    const columns = 4;
    const rowHeight = 38;
    const rows = Math.ceil(data.features.length / columns);
    ensure(30 + rows * rowHeight + 16);
    panel(`Features Included in ${data.planName}`, 30 + rows * rowHeight + 14);
    const colWidth = width / columns;
    data.features.forEach((feature, i) => {
      const x = left + (i % columns) * colWidth + 14;
      const rowY = y + 30 + 12 + Math.floor(i / columns) * rowHeight;
      fill([255, 237, 213]);
      doc.roundedRect(x, rowY, 24, 24, 6, 6, "F");
      stroke(ORANGE, 1.6);
      doc.lines([[3.2, 3.6], [6.4, -7.6]], x + 6.4, rowY + 12.6, [1, 1], "S");
      font("normal", 8.5);
      ink(TEXT);
      doc.text(wrap(feature, colWidth - 54, "normal", 8.5).slice(0, 3), x + 32, rowY + 10);
    });
    y += 30 + rows * rowHeight + 14 + 12;
  }

  // ---------- Payment Summary ----------
  const summaryRows = 1 + data.taxLines.length;
  const noteLines = wrap(data.paymentNote, width - 70, "normal", 8.5);
  const summaryHeight = 30 + summaryRows * 24 + 46 + 14 + noteLines.length * 11 + 14;
  ensure(summaryHeight + 50);
  panel("Payment Summary", summaryHeight, "Currency: INR (Rs.)");
  let rowY = y + 30 + 20;
  const line = (label: string, value: string) => {
    font("normal", 10);
    ink(MUTED);
    doc.text(label, left + 16, rowY);
    ink(TEXT);
    doc.text(value, right - 16, rowY, { align: "right" });
    stroke(BORDER, 0.6);
    doc.line(left + 16, rowY + 8, right - 16, rowY + 8);
    rowY += 24;
  };
  line("Subscription Amount", data.amount);
  for (const tax of data.taxLines) line(tax.label, tax.amount);
  fill(ORANGE_TINT);
  doc.roundedRect(left + 8, rowY - 6, width - 16, 36, 6, 6, "F");
  font("bold", 14);
  ink(TEXT);
  doc.text(data.totalLabel, left + 22, rowY + 17);
  font("bold", 16);
  ink(SUCCESS);
  doc.text(data.total, right - 22, rowY + 17, { align: "right" });
  rowY += 36 + 14;
  fill(MUTED);
  doc.circle(left + 24, rowY + noteLines.length * 5 - 1, 7, "F");
  font("bold", 8.5);
  ink([255, 255, 255]);
  doc.text("i", left + 24, rowY + noteLines.length * 5 + 2, { align: "center" });
  font("normal", 8.5);
  ink(MUTED);
  doc.text(noteLines, left + 40, rowY + 2);
  y += summaryHeight + 16;

  // ---------- Footer: thanks, then "Powered by Platterly" at the foot of the last page ----------
  ensure(60);
  stroke(BORDER, 0.8);
  doc.line(left, y, right, y);
  font("normal", 8.5);
  ink(MUTED);
  let footerY = y + 16;
  if (data.footerNote) {
    const footerLines = wrap(data.footerNote, 470, "normal", 8.5);
    doc.text(footerLines, 297.5, footerY, { align: "center" });
    footerY += footerLines.length * 11 + 4;
  }
  doc.text("Thank you for choosing Platterly!", 297.5, footerY, { align: "center" });
  doc.text("This is a computer-generated invoice and does not need a signature.", 297.5, footerY + 12, { align: "center" });

  const pages = doc.getNumberOfPages();
  doc.setPage(pages);
  font("normal", 8);
  ink(MUTED);
  const poweredY = 812;
  const logoWidth = 52;
  const textWidthPowered = doc.getTextWidth("Powered by ");
  const startX = 297.5 - (textWidthPowered + logoWidth) / 2;
  doc.text("Powered by", startX, poweredY);
  doc.addImage(data.logo, "PNG", startX + textWidthPowered, poweredY - 11, logoWidth, logoWidth * (67.66 / 300.18), "platterly-logo", "FAST");

  return doc.output("arraybuffer");
}
