import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { getKitchenPrepSheet } from "@/modules/menu-approvals/menu-approval";
import { MEAL_TYPE_LABEL } from "@/modules/menu-approvals/approval-snapshot";

const formatDate = (date: Date, options: Intl.DateTimeFormatOptions) => date.toLocaleDateString("en-IN", { timeZone: "UTC", ...options });

/**
 * The preparation sheet as a PDF (AJ, 2026-09-30) — `?download=1` sends it as
 * an attachment for "Download PDF"; without it the browser shows it inline,
 * which is what the Print button loads and prints. Same permission as the page.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["view"] }, organizationId);

  const sheet = await getKitchenPrepSheet(organizationId, id);
  if (!sheet) return new Response("Not found", { status: 404 });
  const { selection, meals, guests, extraPercent, kitchenNotes, kitchenNotesUpdatedAt } = sheet;
  const { event } = selection;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const left = 40;
  let y = 48;

  doc.setFont("helvetica", "bold").setFontSize(16).text("Kitchen Production List", left, y);
  y += 22;
  doc.setFontSize(12).text(event.customer.name, left, y);
  y += 16;
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(90);
  const facts = [
    [event.order?.orderNumber, event.eventType.name].filter(Boolean).join(" · "),
    `${formatDate(event.startDate, { weekday: "short", day: "numeric", month: "short", year: "numeric" })} · ${guests} guests · Kitchen: ${event.assignedKitchen?.name ?? "Not assigned"}`,
    `Cook for ${Math.ceil((guests * (100 + extraPercent)) / 100)} portions (${extraPercent}% extra)`,
  ];
  for (const line of facts) {
    doc.text(line, left, y);
    y += 14;
  }
  doc.setTextColor(0);
  if (kitchenNotes?.trim() || event.notes?.trim()) {
    y += 4;
    doc.setFont("helvetica", "bold").text("Preparation notes", left, y);
    if (kitchenNotesUpdatedAt && kitchenNotes?.trim()) {
      doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(90).text(`Updated ${kitchenNotesUpdatedAt.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true })}`, 555, y, { align: "right" }).setTextColor(0).setFontSize(10);
    }
    y += 13;
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize([kitchenNotes, event.notes].filter((n) => n?.trim()).join("\n"), 515) as string[];
    doc.text(lines, left, y);
    y += lines.length * 12;
  }
  y += 10;

  for (const meal of meals) {
    if (y > 730) {
      doc.addPage();
      y = 48;
    }
    doc.setFont("helvetica", "bold").setFontSize(13).text(`${MEAL_TYPE_LABEL[meal.mealType]} — ${formatDate(meal.date, { weekday: "short", day: "numeric", month: "short" })}`, left, y);
    if (meal.menuName) doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(90).text(meal.menuName, 555, y, { align: "right" }).setTextColor(0);
    y += 8;
    for (const category of meal.categories) {
      autoTable(doc, {
        startY: y,
        margin: { left, right: 40 },
        head: [[`${category.name} (${category.items.length})`, "Guest Qty", `Cook Qty (${extraPercent}% extra)`]],
        body: category.items.map((item) => [item.name, String(item.guestQuantity), String(item.cookQuantity)]),
        styles: { fontSize: 10 },
        headStyles: { fillColor: [241, 241, 241], textColor: 20 },
        columnStyles: { 1: { halign: "right", cellWidth: 70 }, 2: { halign: "right", cellWidth: 120 } },
        theme: "grid",
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
    }
    y += 6;
  }

  const download = new URL(request.url).searchParams.has("download");
  const filename = `kitchen-${event.order?.orderNumber ?? selection.id}.pdf`;
  return new Response(doc.output("arraybuffer"), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
