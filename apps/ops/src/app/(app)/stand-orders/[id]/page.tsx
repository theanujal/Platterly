import Link from "next/link";
import { notFound } from "next/navigation";
import { STAND_FULFILMENT, type ShipTo } from "@platterly/contract";
import { Badge, Card, LinkButton, PageHeader, formatWhen, money } from "@/components/ui";
import { getStandOrderForStaff } from "@/modules/stand/stand";
import { FULFILMENT_LABEL, FULFILMENT_TONE, NEXT_STEP_LABEL } from "@/modules/stand/labels";
import { AdvanceForm } from "./advance-form";

export const dynamic = "force-dynamic";

/** One paid stand order: what to print, where it goes, and the step it is in. */
export default async function StandOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getStandOrderForStaff(id);
  if (!order || order.paymentStatus !== "PAID") notFound();
  const ship = order.shipTo as unknown as ShipTo;
  const next = NEXT_STEP_LABEL[order.fulfilment];

  return (
    <>
      <PageHeader
        title={`Stand order ${order.invoiceNumber ?? order.id.slice(-8)}`}
        description={`${order.business.name} · ${order.quantity} stand${order.quantity === 1 ? "" : "s"} · paid ${formatWhen(order.paidAt)}`}
        actions={<><Badge tone={FULFILMENT_TONE[order.fulfilment]}>{FULFILMENT_LABEL[order.fulfilment]}</Badge><LinkButton href={`/stand-orders/${order.id}/print`} variant="outline">Download print file (PDF)</LinkButton></>}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Print</p>
          <p className="font-medium">{order.kitchenName}</p>
          <p className="break-all text-sm text-muted-foreground">QR to {order.linkUrl}</p>
          <p className="mt-2 text-sm text-muted-foreground">{order.quantity} × A6 (4 × 6 in) acrylic stand. The file is the same for every stand in this order.</p>
        </Card>
        <Card>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Ship to</p>
          <p className="font-medium">{ship.name} · {ship.phone}</p>
          <p className="text-sm text-muted-foreground">{[ship.addressLine1, ship.addressLine2, ship.city, ship.state, ship.postalCode, ship.country].filter(Boolean).join(", ")}</p>
        </Card>
        <Card>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Payment</p>
          <p className="text-sm">{money(order.amount)} + GST {Number(order.gstPercent)}% ({money(order.gstAmount)}) = <span className="font-semibold">{money(order.total)}</span></p>
          <p className="text-xs text-muted-foreground">Invoice {order.invoiceNumber ?? "—"} · Razorpay {order.razorpayPaymentId ?? "—"}</p>
          <p className="mt-2 text-sm"><Link className="hover:underline" href={`/businesses/${order.business.id}`}>{order.business.name}</Link>{order.business.ownerEmail ? ` · ${order.business.ownerEmail}` : ""}</p>
        </Card>
        <Card>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Progress</p>
          <ol className="mb-4 grid gap-1 text-sm">
            {STAND_FULFILMENT.map((step) => {
              const at = step === "PLACED" ? order.paidAt : step === "PRINTING" ? order.printingAt : step === "SHIPPED" ? order.shippedAt : order.deliveredAt;
              return (
                <li key={step} className={at ? "font-medium" : "text-muted-foreground"}>
                  {FULFILMENT_LABEL[step]} {at ? `· ${formatWhen(at)}` : ""}
                </li>
              );
            })}
          </ol>
          {order.trackingNote ? <p className="mb-3 text-sm text-muted-foreground">Delivery note: {order.trackingNote}</p> : null}
          {next ? <AdvanceForm id={order.id} label={next} asksNote={order.fulfilment === "PRINTING"} /> : <p className="text-sm text-success">Delivered.</p>}
        </Card>
      </div>
    </>
  );
}
