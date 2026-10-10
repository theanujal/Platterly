import "server-only";
import { jsPDF } from "jspdf";
import type { InvoiceDocument } from "./invoice-document";

// The design system's colours (globals.css), as RGB for the PDF.
type Rgb = [number, number, number];
const PRIMARY: Rgb = [255, 105, 0];
const TEXT: Rgb = [17, 24, 39];
const MUTED: Rgb = [107, 114, 128];
const BORDER: Rgb = [229, 231, 235];
const BAR: Rgb = [243, 244, 246];
const TINT: Rgb = [255, 237, 213];
const GREEN: Rgb = [22, 163, 74];
const GREEN_TINT: Rgb = [220, 252, 231];
const BLUE: Rgb = [37, 99, 235];
const BLUE_TINT: Rgb = [219, 234, 254];
const AMBER: Rgb = [217, 119, 6];
const RED: Rgb = [239, 68, 68];

const STATUS_COLOR: Record<string, { fg: Rgb; bg: Rgb }> = {
  info: { fg: BLUE, bg: BLUE_TINT },
  success: { fg: GREEN, bg: GREEN_TINT },
  warning: { fg: AMBER, bg: [254, 243, 199] },
  danger: { fg: RED, bg: [254, 226, 226] },
  neutral: { fg: MUTED, bg: BAR },
};

// The standard PDF font has no ₹ glyph, so INR is written "Rs.".
const money = (n: unknown) => `Rs. ${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const LEFT = 40;
const RIGHT = 555;
const WIDTH = RIGHT - LEFT;
const BOTTOM = 790;

/**
 * An invoice or receipt as an A4 PDF, laid out like the sample bill and built from the same document as the invoice page:
 * business and invoice number, invoice and customer information, the event, the menu by category, the charges, the payment
 * summary, notes, terms, the total, and "Powered by Platterly" at the foot of every page.
 */
export function renderInvoicePdf(invoice: InvoiceDocument): Uint8Array {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const color = (c: Rgb) => doc.setTextColor(c[0], c[1], c[2]);
  const fill = (c: Rgb) => doc.setFillColor(c[0], c[1], c[2]);
  const stroke = (c: Rgb) => doc.setDrawColor(c[0], c[1], c[2]).setLineWidth(0.8);
  let y = 50;

  const ensure = (needed: number) => {
    if (y + needed > BOTTOM) {
      doc.addPage();
      y = 50;
    }
  };

  /** A card: a grey title bar (with an optional line under the title), then the body drawn by `body`; the border wraps both. */
  function card(x: number, width: number, title: string, bodyHeight: number, body: (top: number) => void, description?: string) {
    const barHeight = description ? 36 : 24;
    fill(BAR);
    doc.rect(x, y, width, barHeight, "F");
    doc.setFont("helvetica", "bold").setFontSize(11);
    color(TEXT);
    doc.text(title, x + 12, y + 16);
    if (description) {
      doc.setFont("helvetica", "normal").setFontSize(8);
      color(MUTED);
      doc.text(description, x + 12, y + 28);
    }
    body(y + barHeight);
    stroke(BORDER);
    doc.roundedRect(x, y, width, barHeight + bodyHeight, 3, 3, "S");
    return barHeight + bodyHeight;
  }

  // --- Header: business on the left, the document title and number on the right ---
  doc.setFont("helvetica", "bold").setFontSize(22);
  color(TEXT);
  doc.text(invoice.business.name, LEFT, y + 10);
  doc.setFont("helvetica", "normal").setFontSize(8);
  color(MUTED);
  doc.text("CATERING SERVICES", LEFT, y + 24, { charSpace: 2 });
  let leftY = y + 38;
  doc.setFontSize(9);
  if (invoice.business.address) {
    const lines = doc.splitTextToSize(invoice.business.address, 280) as string[];
    doc.text(lines, LEFT, leftY);
    leftY += lines.length * 11;
  }
  if (invoice.business.gstNumber) {
    doc.text(`GSTIN ${invoice.business.gstNumber}`, LEFT, leftY);
    leftY += 11;
  }
  doc.setFont("helvetica", "bold").setFontSize(22);
  color(TEXT);
  doc.text(invoice.title, RIGHT, y + 10, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(10);
  color(MUTED);
  const meta: [string, string][] = [
    [invoice.type === "RECEIPT" ? "Receipt #:" : "Invoice #:", invoice.number],
    ["Date:", date(invoice.issueDate)],
    ...(invoice.type === "INVOICE" ? ([["Due Date:", invoice.dueDate ? date(invoice.dueDate) : "On receipt"]] as [string, string][]) : []),
  ];
  meta.forEach(([label, value], i) => {
    const my = y + 28 + i * 14;
    color(MUTED);
    doc.setFont("helvetica", "normal").text(label, 440, my, { align: "right" });
    color(TEXT);
    doc.setFont("helvetica", "bold").text(value, RIGHT, my, { align: "right" });
  });
  y = Math.max(leftY, y + 28 + meta.length * 14) + 8;
  stroke(BORDER);
  doc.line(LEFT, y, RIGHT, y);
  y += 16;

  // --- Invoice information | Customer information ---
  const half = (WIDTH - 14) / 2;
  doc.setFont("helvetica", "normal").setFontSize(10);
  const addressLines = doc.splitTextToSize(invoice.customer.address ?? "-", half - 100) as string[];
  const customerRows = 1 + (invoice.customer.phone ? 1 : 0) + addressLines.length;
  const infoBody = Math.max(2 * 20 + 18, customerRows * 20 + 14);
  const rowAt = (x: number, top: number, i: number, label: string) => {
    doc.setFont("helvetica", "bold").setFontSize(10);
    color(MUTED);
    doc.text(`${label}:`, x + 12, top + 20 + i * 20);
  };
  const startY = y;
  card(LEFT, half, invoice.type === "RECEIPT" ? "Receipt Information" : "Invoice Information", infoBody, (top) => {
    rowAt(LEFT, top, 0, "Order ID");
    doc.setFont("helvetica", "normal").setFontSize(10);
    color(TEXT);
    doc.text(invoice.orderNumber ?? "-", LEFT + 100, top + 20);
    rowAt(LEFT, top, 1, "Status");
    const status = STATUS_COLOR[invoice.status.tone];
    doc.setFont("helvetica", "bold").setFontSize(9);
    const w = doc.getTextWidth(invoice.status.label) + 16;
    fill(status.bg);
    doc.roundedRect(LEFT + 100, top + 28, w, 18, 9, 9, "F");
    color(status.fg);
    doc.text(invoice.status.label, LEFT + 108, top + 40);
  });
  y = startY;
  const rightX = LEFT + half + 14;
  const cardHeight = card(rightX, half, "Customer Information", infoBody, (top) => {
    let row = 0;
    const put = (label: string, lines: string[]) => {
      rowAt(rightX, top, row, label);
      doc.setFont("helvetica", "normal").setFontSize(10);
      color(TEXT);
      doc.text(lines, rightX + 100, top + 20 + row * 20);
      row += lines.length;
    };
    put("Name", [invoice.customer.name]);
    if (invoice.customer.phone) put("Phone", [invoice.customer.phone]);
    put("Address", addressLines);
  });
  y += cardHeight + 14;

  // --- Event details ---
  ensure(70);
  const eventDate = invoice.event.start.toDateString() === invoice.event.end.toDateString() ? date(invoice.event.start) : `${date(invoice.event.start)} - ${date(invoice.event.end)}`;
  const cells: [string, string][] = [
    ["Event Type", invoice.event.type ?? "-"],
    ["Event Date", eventDate],
    ["Guests", invoice.event.guests !== null ? String(invoice.event.guests) : "-"],
  ];
  const venueHeight = invoice.event.venue ? 30 : 0;
  y += card(LEFT, WIDTH, "Event Details", 46 + venueHeight, (top) => {
    cells.forEach(([label, value], i) => {
      const cx = LEFT + 14 + i * (WIDTH / 3);
      doc.setFont("helvetica", "normal").setFontSize(8.5);
      color(MUTED);
      doc.text(label, cx, top + 18);
      doc.setFont("helvetica", "bold").setFontSize(11);
      color(TEXT);
      doc.text(doc.splitTextToSize(value, WIDTH / 3 - 20) as string[], cx, top + 34);
      if (i > 0) doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]).line(LEFT + i * (WIDTH / 3), top + 8, LEFT + i * (WIDTH / 3), top + 38);
    });
    if (invoice.event.venue) {
      doc.setFont("helvetica", "normal").setFontSize(8.5);
      color(MUTED);
      doc.text("Venue", LEFT + 14, top + 56);
      doc.setFont("helvetica", "bold").setFontSize(10);
      color(TEXT);
      doc.text(invoice.event.venue, LEFT + 60, top + 56);
    }
  }) + 14;

  // --- Selected menu & food items ---
  if (invoice.menu) {
    const menu = invoice.menu;
    const colWidth = (WIDTH - 24 - 12) / 2;
    const groupHeight = (items: string[]) => 26 + items.length * 14 + 8;
    const rows: { groups: typeof menu.groups }[] = [];
    for (let i = 0; i < menu.groups.length; i += 2) rows.push({ groups: menu.groups.slice(i, i + 2) });
    const mainHeight = menu.name ? 56 : 0;
    ensure(36 + mainHeight + 40);
    // Drawn row by row so a long menu flows onto the next page: the title bar and main menu first, then each row of groups.
    fill(BAR);
    doc.rect(LEFT, y, WIDTH, 36, "F");
    doc.setFont("helvetica", "bold").setFontSize(11);
    color(TEXT);
    doc.text("Selected Menu & Food Items", LEFT + 12, y + 16);
    doc.setFont("helvetica", "normal").setFontSize(8);
    color(MUTED);
    doc.text("Below are the categories and items selected for this event.", LEFT + 12, y + 28);
    y += 36 + 8;
    if (menu.name) {
      fill(TINT);
      stroke(PRIMARY);
      doc.roundedRect(LEFT + 12, y, WIDTH - 24, 46, 4, 4, "FD");
      fill(PRIMARY);
      doc.circle(LEFT + 38, y + 23, 13, "F");
      doc.setFont("helvetica", "bold").setFontSize(8);
      color(PRIMARY);
      doc.text("MAIN MENU", LEFT + 62, y + 18);
      doc.setFontSize(14);
      color(TEXT);
      doc.text(menu.name, LEFT + 62, y + 36);
      y += 56;
    }
    for (const row of rows) {
      const rowHeight = Math.max(...row.groups.map((g) => groupHeight(g.items)));
      if (y + rowHeight > BOTTOM) {
        doc.addPage();
        y = 50;
      }
      row.groups.forEach((group, i) => {
        const gx = LEFT + 12 + i * (colWidth + 12);
        fill(BAR);
        doc.rect(gx, y, colWidth, 22, "F");
        doc.setFont("helvetica", "bold").setFontSize(10);
        color(TEXT);
        doc.text(group.name, gx + 10, y + 15);
        doc.setFont("helvetica", "normal").setFontSize(10);
        group.items.forEach((item, k) => {
          fill(TEXT);
          doc.circle(gx + 14, y + 33 + k * 14, 1.6, "F");
          doc.text(doc.splitTextToSize(item, colWidth - 36)[0] as string, gx + 24, y + 36 + k * 14);
        });
        stroke(BORDER);
        doc.roundedRect(gx, y, colWidth, groupHeight(group.items), 3, 3, "S");
      });
      y += rowHeight + 10;
    }
    y += 4;
  }

  // --- Charges ---
  ensure(60);
  fill(BAR);
  doc.rect(LEFT, y, WIDTH, 24, "F");
  doc.setFont("helvetica", "bold").setFontSize(11);
  color(TEXT);
  doc.text("Charges", LEFT + 12, y + 16);
  y += 24;
  doc.setFont("helvetica", "bold").setFontSize(8);
  color(MUTED);
  const cols = { item: LEFT + 12, hsn: 262, qty: 372, rate: 456, amt: RIGHT - 12 };
  doc.text("ITEM", cols.item, y + 14);
  if (invoice.gst.enabled) doc.text("HSN/SAC", cols.hsn, y + 14);
  doc.text("QTY", cols.qty, y + 14, { align: "right" });
  doc.text("RATE", cols.rate, y + 14, { align: "right" });
  doc.text("AMOUNT", cols.amt, y + 14, { align: "right" });
  y += 22;
  doc.setFont("helvetica", "normal").setFontSize(10);
  for (const item of invoice.charges) {
    const title = doc.splitTextToSize(item.description, invoice.gst.enabled ? 200 : 300) as string[];
    const rowHeight = title.length * 12 + (item.detail ? 12 : 0) + 12;
    ensure(rowHeight);
    stroke(BORDER);
    doc.line(LEFT, y, RIGHT, y);
    color(TEXT);
    doc.text(title, cols.item, y + 14);
    if (item.detail) {
      color(MUTED);
      doc.setFontSize(8.5).text(item.detail, cols.item, y + 14 + title.length * 12 - 1).setFontSize(10);
    }
    color(TEXT);
    if (invoice.gst.enabled && item.hsnSac) doc.text(item.hsnSac, cols.hsn, y + 14);
    doc.text(item.quantity.toLocaleString("en-IN"), cols.qty, y + 14, { align: "right" });
    doc.text(money(item.rate), cols.rate, y + 14, { align: "right" });
    doc.text(money(item.amount), cols.amt, y + 14, { align: "right" });
    y += rowHeight;
  }
  stroke(BORDER);
  doc.line(LEFT, y, RIGHT, y);
  y += 16;

  // --- Payment summary ---
  const gstRows = invoice.gst.enabled ? (invoice.gst.type === "IGST" ? 3 : 4) : 0;
  const summaryHeight = invoice.summary.length * 20 + 22 + gstRows * 13 + (gstRows ? 12 : 0);
  ensure(24 + summaryHeight);
  y += card(LEFT, WIDTH, "Payment Summary", summaryHeight, (top) => {
    let ry = top + 18;
    for (const row of invoice.summary) {
      if (row.kind === "balance") {
        fill(GREEN_TINT);
        doc.roundedRect(LEFT + 8, ry - 14, WIDTH - 16, 26, 4, 4, "F");
        doc.setFont("helvetica", "bold").setFontSize(11);
        color(GREEN);
        doc.text(row.label, LEFT + 16, ry + 3);
        doc.setFontSize(13);
        doc.text(money(row.value), RIGHT - 16, ry + 3, { align: "right" });
        ry += 28;
      } else {
        doc.setFont("helvetica", "bold").setFontSize(10);
        color(MUTED);
        doc.text(row.label, LEFT + 16, ry);
        doc.setFont("helvetica", "normal");
        color(TEXT);
        doc.text(row.kind === "discount" ? `- ${money(row.value)}` : money(row.value), RIGHT - 16, ry, { align: "right" });
        ry += 20;
      }
    }
    if (invoice.gst.enabled) {
      ry += 4;
      doc.setFont("helvetica", "normal").setFontSize(8.5);
      color(MUTED);
      const gstLines: [string, string][] = [["Taxable value", money(invoice.gst.taxableValue)]];
      if (invoice.gst.type === "IGST") gstLines.push([`IGST ${invoice.gst.rate}%`, money(invoice.gst.igst)]);
      else {
        gstLines.push([`CGST ${invoice.gst.rate / 2}%`, money(invoice.gst.cgst)]);
        gstLines.push([`SGST ${invoice.gst.rate / 2}%`, money(invoice.gst.sgst)]);
      }
      gstLines.push(["Prices include GST.", ""]);
      for (const [label, value] of gstLines) {
        doc.text(label, LEFT + 16, ry);
        if (value) doc.text(value, RIGHT - 16, ry, { align: "right" });
        ry += 13;
      }
    }
  }) + 14;

  // --- Notes and terms ---
  if (invoice.notes) {
    const lines = doc.splitTextToSize(invoice.notes, WIDTH - 36) as string[];
    ensure(24 + lines.length * 12 + 16);
    y += card(LEFT, WIDTH, "Notes", lines.length * 12 + 14, (top) => {
      doc.setFont("helvetica", "normal").setFontSize(9);
      color(MUTED);
      doc.text(lines, LEFT + 16, top + 16);
    }) + 14;
  }
  if (invoice.terms) {
    const lines = doc.splitTextToSize(invoice.terms, WIDTH - 32) as string[];
    ensure(24 + lines.length * 11 + 16);
    y += card(LEFT, WIDTH, "Terms & Conditions", lines.length * 11 + 14, (top) => {
      doc.setFont("helvetica", "normal").setFontSize(9);
      color(MUTED);
      doc.text(lines, LEFT + 16, top + 16);
    }) + 14;
  }

  // --- Total ---
  ensure(50);
  stroke(TEXT);
  doc.setLineWidth(1.6).line(LEFT, y, RIGHT, y);
  y += 28;
  doc.setFont("helvetica", "bold").setFontSize(18);
  color(TEXT);
  doc.text("Total Amount:", LEFT, y);
  color(GREEN);
  doc.setFontSize(20).text(money(invoice.total), RIGHT, y, { align: "right" });

  // --- Footer on every page ---
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal").setFontSize(8.5);
    color(MUTED);
    const label = "Powered by ";
    const brand = "Platterly";
    const total = doc.getTextWidth(label) + doc.setFont("helvetica", "bold").getTextWidth(brand);
    const startX = (595 - total) / 2;
    doc.setFont("helvetica", "normal");
    doc.text(label, startX, 818);
    color(PRIMARY);
    doc.setFont("helvetica", "bold").text(brand, startX + doc.setFont("helvetica", "normal").getTextWidth(label), 818);
  }
  return new Uint8Array(doc.output("arraybuffer"));
}
