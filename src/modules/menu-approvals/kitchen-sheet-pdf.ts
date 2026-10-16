import { jsPDF } from "jspdf";

// The kitchen order (preparation sheet) as a PDF, for the kitchen only (AJ, 2026-10-17). Laid out like the kitchen's own "Lunch format"
// sheet but drawn in the app's own look: the brand orange, soft rounded cards, muted labels over bold values. Kitchen name and address on
// top, the meal as a title chip, a table of the booking facts, the selected menu with its categories in two columns, then the kitchen's
// own "Service Also Include" and "Please Note" texts (Settings -> Kitchen Rules). One page per meal. No prices, no payments, no phone
// numbers: this sheet goes to the kitchen floor. Pure: it takes plain data and returns the document, so it can be tested.

export interface KitchenSheetMeal {
  /** "Lunch" */
  title: string;
  /** "Day 2" when the order spans several days, else null. */
  dayLabel: string | null;
  /** The event day, already formatted: "Sat, 1 Nov 2026". */
  dateText: string;
  /** The planned food pickup time from the kitchen ("10:00 AM"), or null to leave a line to write on. */
  pickup: string | null;
  totalGuests: number;
  adults: number;
  under5: number;
  age5to10: number;
  cookFor: number;
  extraPercent: number;
  menuName: string | null;
  categories: { name: string; items: string[] }[];
  /** Add-ons and live counters ordered with this meal, shown under "Service Also Include". */
  extras: string[];
}

export interface KitchenSheetInput {
  kitchen: { name: string; address: string; phone: string | null };
  orderNumber: string | null;
  bookingDate: string;
  customerName: string;
  eventType: string | null;
  notes: string | null;
  meals: KitchenSheetMeal[];
  /** One point per entry, from Settings -> Kitchen Rules. Empty = that column is left out. */
  serviceIncludes: string[];
  pleaseNote: string[];
}

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 36; // half an inch, as on the paper sheet
const CONTENT_W = PAGE_W - MARGIN * 2;
const LABEL_W = Math.round(CONTENT_W * 0.36);
const VALUE_W = CONTENT_W - LABEL_W;
const COL_W = CONTENT_W / 2;
const PAD = 10;
const RADIUS = 7;
const BOTTOM = PAGE_H - MARGIN - 14;

type Rgb = [number, number, number];
// The app's tokens: primary orange, its 50 tint, gray 900 / 500, the hairline border and the danger red.
const PRIMARY: Rgb = [255, 105, 0];
const TINT: Rgb = [255, 244, 235];
const INK: Rgb = [17, 24, 39];
const MUTED: Rgb = [107, 114, 128];
const LINE: Rgb = [229, 231, 235];
const DANGER: Rgb = [220, 38, 38];

type Line = { text: string; bold?: boolean; color?: Rgb; indent?: number; size?: number; gap?: number };

export function buildKitchenSheetPdf(input: KitchenSheetInput): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let y = MARGIN;

  const card = (x: number, top: number, width: number, height: number) => doc.setDrawColor(...LINE).setLineWidth(0.9).roundedRect(x, top, width, height, RADIUS, RADIUS);

  const header = () => {
    doc.setFillColor(...PRIMARY).roundedRect(MARGIN, MARGIN, 4, 30, 2, 2, "F");
    doc.setTextColor(...INK).setFont("helvetica", "bold").setFontSize(16).text(input.kitchen.name, MARGIN + 12, MARGIN + 13);
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED);
    const address = doc.splitTextToSize([input.kitchen.address, input.kitchen.phone].filter(Boolean).join("  ·  "), CONTENT_W - 12) as string[];
    doc.text(address, MARGIN + 12, MARGIN + 26);
    const bottom = MARGIN + 26 + address.length * 11;
    doc.setDrawColor(...LINE).setLineWidth(0.9).line(MARGIN, bottom + 4, PAGE_W - MARGIN, bottom + 4);
    doc.setTextColor(...INK);
    y = bottom + 16;
  };

  const newPage = () => {
    doc.addPage();
    header();
  };

  /** The meal as a rounded orange chip (like the app's badges), the order number on the right. */
  const title = (text: string, sub: string | null) => {
    doc.setFont("helvetica", "bold").setFontSize(12);
    const label = text.toUpperCase();
    const chipW = doc.getTextWidth(label) + 24;
    doc.setFillColor(...TINT).roundedRect(MARGIN, y, chipW, 24, 12, 12, "F");
    doc.setTextColor(...PRIMARY).text(label, MARGIN + 12, y + 16);
    if (sub) doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...MUTED).text(sub, MARGIN + chipW + 10, y + 16);
    if (input.orderNumber) doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(...INK).text(`Order ${input.orderNumber}`, PAGE_W - MARGIN, y + 16, { align: "right" });
    doc.setTextColor(...INK);
    y += 36;
  };

  type Fact = { label: string; value: string; sub?: string; color?: Rgb };

  /** The booking facts as one rounded card: muted label on the left, bold value on the right, a hairline between rows. */
  const facts = (rows: Fact[]) => {
    const prepared = rows.map((fact) => {
      const valueLines = doc.setFont("helvetica", "bold").setFontSize(10.5).splitTextToSize(fact.value || " ", VALUE_W - PAD * 2) as string[];
      const subLines = fact.sub ? (doc.setFont("helvetica", "normal").setFontSize(9).splitTextToSize(fact.sub, VALUE_W - PAD * 2) as string[]) : [];
      const labelLines = doc.setFont("helvetica", "normal").setFontSize(10).splitTextToSize(fact.label, LABEL_W - PAD * 2) as string[];
      const height = Math.max(26, Math.max(valueLines.length * 13 + subLines.length * 11.5 + 12, labelLines.length * 13 + 12));
      return { fact, valueLines, subLines, labelLines, height };
    });
    const total = prepared.reduce((sum, r) => sum + r.height, 0);
    if (y + total > BOTTOM) newPage();
    card(MARGIN, y, CONTENT_W, total);
    let rowY = y;
    prepared.forEach((r, index) => {
      if (index > 0) doc.setDrawColor(...LINE).setLineWidth(0.6).line(MARGIN, rowY, PAGE_W - MARGIN, rowY);
      doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...MUTED).text(r.labelLines, MARGIN + PAD, rowY + 17);
      doc.setFont("helvetica", "bold").setFontSize(10.5).setTextColor(...(r.fact.color ?? INK)).text(r.valueLines, MARGIN + LABEL_W + PAD, rowY + 17);
      if (r.subLines.length > 0) doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED).text(r.subLines, MARGIN + LABEL_W + PAD, rowY + 17 + r.valueLines.length * 13 - 1);
      rowY += r.height;
    });
    doc.setTextColor(...INK);
    y += total + 12;
  };

  /**
   * Lines of text in one or two columns inside a rounded card, split over pages when long (the card's frame repeats on each page).
   * A column may be empty: the other then keeps its half.
   */
  const columns = (left: Line[], right: Line[], leading: number) => {
    const two = left.length > 0 && right.length > 0;
    const leftQueue = [...left];
    const rightQueue = [...right];
    const heightOf = (lines: Line[]) => lines.reduce((sum, l) => sum + leading + (l.gap ?? 0), 0);
    while (leftQueue.length > 0 || rightQueue.length > 0) {
      if (BOTTOM - y < PAD * 2 + leading * 4) newPage();
      const room = BOTTOM - y - PAD * 2;
      const take = (queue: Line[]) => {
        const taken: Line[] = [];
        let used = 0;
        while (queue.length > 0 && used + leading + (queue[0].gap ?? 0) <= room) {
          used += leading + (queue[0].gap ?? 0);
          taken.push(queue.shift()!);
        }
        if (taken.length === 0 && queue.length > 0) taken.push(queue.shift()!);
        return taken;
      };
      const l = take(leftQueue);
      const r = take(rightQueue);
      const height = Math.max(heightOf(l), heightOf(r)) + PAD * 2;
      card(MARGIN, y, CONTENT_W, height);
      if (two) doc.setDrawColor(...LINE).setLineWidth(0.6).line(MARGIN + COL_W, y + 8, MARGIN + COL_W, y + height - 8);
      for (const [x, lines] of [
        [MARGIN, l],
        [MARGIN + COL_W, r],
      ] as const) {
        let lineY = y + PAD;
        for (const line of lines) {
          const size = line.size ?? 10;
          lineY += line.gap ?? 0;
          doc.setFont("helvetica", line.bold ? "bold" : "normal").setFontSize(size).setTextColor(...(line.color ?? INK));
          doc.text(line.text, x + PAD + (line.indent ?? 0), lineY + size);
          lineY += leading;
        }
      }
      doc.setTextColor(...INK);
      y += height + 12;
    }
  };

  /** Wraps a list of points to a column's width as numbered lines ("1. …"). */
  const numbered = (items: string[]): Line[] =>
    items.flatMap((item, index) => {
      doc.setFont("helvetica", "normal").setFontSize(9.5);
      const wrapped = doc.splitTextToSize(`${index + 1}. ${item}`, COL_W - PAD * 2 - 6) as string[];
      return wrapped.map((text, part) => ({ text, size: 9.5, indent: part === 0 ? 0 : 11 }));
    });

  // An order with no meals planned yet still gets a page, saying so.
  if (input.meals.length === 0) {
    header();
    title("Kitchen Order", null);
    facts([
      { label: "Name", value: input.customerName },
      { label: "Meals", value: "No meals have been planned on this order yet." },
    ]);
  }

  input.meals.forEach((meal, mealIndex) => {
    if (mealIndex > 0) doc.addPage();
    header();
    title(meal.title, meal.dayLabel);

    const guestDetail = `Adults - ${meal.adults}   ·   Under 5 Years - ${meal.under5}   ·   5 to 10 Years - ${meal.age5to10}`;
    facts([
      { label: "Booking Date", value: input.bookingDate },
      { label: "Date Of Event", value: meal.dateText },
      { label: "Time Of Event", value: " ", color: DANGER },
      { label: "Food Pickup from Kitchen", value: meal.pickup ?? " ", color: DANGER },
      { label: "Type Of Event", value: [input.eventType, meal.title].filter(Boolean).join(" · ") },
      { label: "Total Guests", value: String(meal.totalGuests), sub: guestDetail },
      { label: "Cook for", value: `${meal.cookFor} portions`, sub: `${meal.extraPercent}% extra on the guest count` },
      { label: "Name", value: input.customerName },
      { label: "Selected Menu", value: meal.menuName ?? "-" },
    ]);

    // The selected categories over two columns, each with its dishes underneath; both columns about as long.
    const blocks = meal.categories.map((category) => {
      const lines: Line[] = [{ text: `${category.name} (${category.items.length})`, bold: true, color: PRIMARY, size: 10.5, gap: 3 }];
      for (const item of category.items) {
        doc.setFont("helvetica", "normal").setFontSize(10);
        for (const [part, text] of (doc.splitTextToSize(item, COL_W - PAD * 2 - 14) as string[]).entries()) lines.push({ text: part === 0 ? `-  ${text}` : text, indent: part === 0 ? 4 : 17 });
      }
      return lines;
    });
    const total = blocks.reduce((sum, block) => sum + block.length, 0);
    const left: Line[] = [];
    const right: Line[] = [];
    for (const block of blocks) (left.length < total / 2 ? left : right).push(...block);
    if (left.length === 0 && right.length === 0) left.push({ text: "No dishes selected yet.", color: MUTED });
    columns(left, right, 13);

    // This order's notes sit right under the menu, before the standing texts.
    if (input.notes?.trim()) {
      doc.setFont("helvetica", "normal").setFontSize(10);
      const wrapped = doc.splitTextToSize(input.notes.trim(), CONTENT_W - PAD * 2 - 12) as string[];
      columns([{ text: "Kitchen / Preparation Notes", bold: true, color: PRIMARY, size: 10.5 }, ...wrapped.map((text) => ({ text }))], [], 13);
    }

    // The kitchen's own standing texts, plus this meal's add-ons and live counters under "Service Also Include".
    const service = [...input.serviceIncludes, ...meal.extras];
    const left2: Line[] = service.length > 0 ? [{ text: "Service Also Include", bold: true, color: PRIMARY, size: 10.5 }, ...numbered(service)] : [];
    const right2: Line[] = input.pleaseNote.length > 0 ? [{ text: "Please Note", bold: true, color: PRIMARY, size: 10.5 }, ...numbered(input.pleaseNote)] : [];
    if (left2.length > 0 || right2.length > 0) columns(left2, right2, 12);
  });

  // Page numbers once the page count is known.
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page).setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED).text(`Page ${page} of ${pages}`, PAGE_W - MARGIN, PAGE_H - MARGIN + 4, { align: "right" });
  }
  doc.setTextColor(...INK);
  return doc;
}
