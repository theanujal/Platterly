import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireActiveOrganization, requirePermission, hasPermission } from "@/lib/auth/require-session";
import { assertOrderAtMyLocation } from "@/modules/locations/active-location";
import { getInvoice, confirmedPaidForOrder } from "@/modules/invoices/invoice";
import { invoiceDisplayStatus } from "@/modules/invoices/invoice-status";
import { longDate } from "@/modules/invoices/invoice-format";
import { listOrderPayments } from "@/modules/payments/payment";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { InvoiceStatusBadge, InvoiceTypeBadge } from "../_components/invoice-badges";
import { InvoiceHeaderActions } from "../_components/invoice-actions";
import { InvoicePaper } from "../_components/invoice-paper";
import { PaymentsPanel, type PaymentRowData } from "../_components/payments-panel";

export const metadata: Metadata = {
  title: "Invoice — Platterly",
  robots: { index: false, follow: false },
};

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId, session } = await requireActiveOrganization();
  await requirePermission({ invoices: ["view"] }, organizationId);
  const invoice = await getInvoice(organizationId, id);
  if (!invoice) notFound();
  await assertOrderAtMyLocation(organizationId, session.user.id, invoice.orderId);

  const [paid, payments, canEditInvoice, canDelete, canRecord, canManage] = await Promise.all([
    confirmedPaidForOrder(invoice.orderId),
    listOrderPayments(organizationId, invoice.orderId),
    hasPermission({ invoices: ["edit"] }, organizationId),
    hasPermission({ invoices: ["delete"] }, organizationId),
    hasPermission({ payments: ["create"] }, organizationId),
    hasPermission({ payments: ["manage"] }, organizationId),
  ]);
  const orderTotal = Number(invoice.order.total);
  const status = invoiceDisplayStatus(invoice.status, invoice.dueDate);
  const rows: PaymentRowData[] = payments.map((p) => ({
    id: p.id,
    amount: Number(p.amount),
    type: p.type,
    method: p.method,
    source: p.source,
    status: p.status,
    receivedAt: p.receivedAt.toISOString(),
    reference: p.reference,
    receipt: p.receipt ? { id: p.receipt.id, number: p.receipt.number } : null,
  }));

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Invoices", href: "/invoices" }, { label: invoice.number }]} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold">
            {invoice.number}
            <InvoiceStatusBadge status={status} />
            <InvoiceTypeBadge type={invoice.type} />
          </h1>
          <p className="text-sm text-muted-foreground">
            For {invoice.order.orderNumber ?? "this order"} · {invoice.customerName}
          </p>
        </div>
        <InvoiceHeaderActions invoiceId={invoice.id} type={invoice.type} canSend={canEditInvoice} canCancel={canDelete} cancellable={invoice.status !== "CANCELLED" && invoice.status !== "PAID" && invoice.status !== "PARTIALLY_PAID"} />
      </div>
      <Separator />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <InvoicePaper invoice={{ ...invoice, eventLabel: [invoice.order.eventType?.name, invoice.order.eventStartDate ? longDate(invoice.order.eventStartDate) : null].filter(Boolean).join(" · ") || null }} />
        <PaymentsPanel orderId={invoice.orderId} invoiceId={invoice.type === "INVOICE" ? invoice.id : undefined} total={orderTotal} paid={paid} balance={Math.max(orderTotal - paid, 0)} payments={rows} canRecord={canRecord} canManage={canManage} />
      </div>
    </div>
  );
}
