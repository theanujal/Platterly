import Link from "next/link";
import { Badge, Card, Empty, PageHeader, Table, formatWhen } from "@/components/ui";
import { listRefundHistory, listRefundQueue } from "@/modules/billing/refunds";
import { DecisionForms } from "./decision-forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Refunds" };

const rupees = (value: number) => `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const daysAgo = (date: Date | null) => {
  const n = date ? Math.floor((Date.now() - date.getTime()) / 86_400_000) : 0;
  return n === 0 ? "today" : n === 1 ? "1 day ago" : `${n} days ago`;
};

export default async function RefundsPage() {
  const [queue, history] = await Promise.all([listRefundQueue(), listRefundHistory()]);
  return (
    <>
      <PageHeader title="Refunds" description="Business Admins ask for a refund within 7 days of paying. You set the amount (up to what was paid) and choose what happens to the plan. The money goes back through Razorpay and a credit note is made." />
      <div className="grid gap-6">
        <section aria-label="Waiting for a decision" className="grid gap-4">
          <h2 className="text-base font-semibold">Waiting for a decision ({queue.length})</h2>
          {queue.length === 0 ? (
            <Empty>No refund requests are waiting.</Empty>
          ) : (
            queue.map((r) => (
              <Card key={r.id}>
                <div data-testid={`refund-request-${r.id}`} className="grid gap-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <Link href={`/businesses/${r.business.id}`} className="font-semibold hover:underline">{r.business.name}</Link>
                      <p className="text-sm text-muted-foreground">{r.productName} · {r.planName}, {r.interval === "ANNUAL" ? "yearly" : "monthly"} · {rupees(r.total)} paid {formatWhen(r.paidAt)} ({daysAgo(r.paidAt)}){r.invoiceNumber ? ` · invoice ${r.invoiceNumber}` : ""}</p>
                      {r.business.ownerEmail ? <p className="text-sm text-muted-foreground">{r.business.ownerEmail}</p> : null}
                    </div>
                    <Badge tone="warning">Asked {formatWhen(r.createdAt)}</Badge>
                  </div>
                  <blockquote className="border-l-2 border-border pl-3 text-sm">{r.reason}</blockquote>
                  <DecisionForms requestId={r.id} max={r.refundable} />
                </div>
              </Card>
            ))
          )}
        </section>
        <section aria-label="Decided" className="grid gap-4">
          <h2 className="text-base font-semibold">Decided</h2>
          {history.length === 0 ? (
            <Empty>Nothing has been decided yet.</Empty>
          ) : (
            <Table head={["Decided", "Business", "Product", "Outcome", "Refunded", "Credit note"]}>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>{formatWhen(h.decidedAt)}</td>
                  <td><Link href={`/businesses/${h.business.id}`} className="hover:underline">{h.business.name}</Link></td>
                  <td>{h.productName}</td>
                  <td>
                    <Badge tone={h.status === "APPROVED" ? "success" : "neutral"}>{h.status === "APPROVED" ? (h.refund?.endMode === "END_NOW" ? "Refunded, plan ended" : "Refunded, plan runs to period end") : "Declined"}</Badge>
                    {h.rejectionNote ? <span className="block text-xs text-muted-foreground">{h.rejectionNote}</span> : null}
                  </td>
                  <td>{h.refund ? rupees(h.refund.total) : ""}</td>
                  <td>{h.refund ? <a href={`/refunds/${h.refund.id}/credit-note`} className="hover:underline">{h.refund.creditNoteNumber}</a> : ""}</td>
                </tr>
              ))}
            </Table>
          )}
        </section>
      </div>
    </>
  );
}
