import Link from "next/link";
import { STAND_FULFILMENT, type StandFulfilment } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { Badge, Empty, PageHeader, Table, formatWhen } from "@/components/ui";
import { PickProduct } from "@/components/pick-product";
import { getSelectedProduct } from "@/lib/selected-product";
import { listStandOrdersForStaff } from "@/modules/stand/stand";
import { FULFILMENT_LABEL, FULFILMENT_TONE } from "@/modules/stand/labels";
import { PricingForm } from "./pricing-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stand orders" };

const money = (value: unknown) => `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function StandOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const selected = await getSelectedProduct();
  if (!selected) return (<><PageHeader title="Stand orders" description="Order QR stands kitchens paid for: print, ship, deliver." /><PickProduct what="Stand orders" /></>);
  const { status } = await searchParams;
  const filter = (STAND_FULFILMENT as readonly string[]).includes(status ?? "") ? (status as StandFulfilment) : "ALL";
  const [product, orders, open] = await Promise.all([
    prisma.product.findUniqueOrThrow({ where: { key: selected.key }, select: { standPrice: true, standGstPercent: true, standHsnCode: true } }),
    listStandOrdersForStaff({ productKey: selected.key, fulfilment: filter }),
    prisma.standOrder.count({ where: { productKey: selected.key, paymentStatus: "PAID", fulfilment: { not: "DELIVERED" } } }),
  ]);

  return (
    <>
      <PageHeader title="Stand orders" description="Order QR stands kitchens paid for. Each has a print-ready A6 file; move it Placed, Printing, Shipped, Delivered." actions={<Badge tone={open > 0 ? "warning" : "success"}>{open} to do</Badge>} />
      <PricingForm productKey={selected.key} productName={selected.name} price={product.standPrice === null ? "" : String(product.standPrice)} gstPercent={String(product.standGstPercent)} hsnCode={product.standHsnCode ?? ""} />
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Fulfilment">
        {(["ALL", ...STAND_FULFILMENT] as const).map((s) => (
          <Link key={s} href={s === "ALL" ? "/stand-orders" : `/stand-orders?status=${s}`} role="tab" aria-selected={s === filter} className={`inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium ${s === filter ? "bg-primary text-primary-foreground" : "border border-border bg-white"}`}>
            {s === "ALL" ? "All" : FULFILMENT_LABEL[s]}
          </Link>
        ))}
      </div>
      {orders.length === 0 ? (
        <Empty>No stand orders {filter === "ALL" ? "yet" : "in this step"}.</Empty>
      ) : (
        <Table head={["Order", "Kitchen", "Stands", "Total", "Paid", "Status"]}>
          {orders.map((o) => (
            <tr key={o.id}>
              <td><Link className="font-mono text-xs font-medium text-accent-foreground hover:underline" href={`/stand-orders/${o.id}`}>{o.invoiceNumber ?? o.id.slice(-8)}</Link></td>
              <td><Link className="hover:underline" href={`/businesses/${o.business.id}`}>{o.business.name}</Link></td>
              <td>{o.quantity}</td>
              <td>{money(o.total)}</td>
              <td>{formatWhen(o.paidAt)}</td>
              <td><Badge tone={FULFILMENT_TONE[o.fulfilment]}>{FULFILMENT_LABEL[o.fulfilment]}</Badge></td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
