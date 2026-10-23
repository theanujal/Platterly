import { Badge, Empty, Table, formatWhen, money } from "@/components/ui";
import { describeRazorpayEvent, listRazorpayEvents } from "@/modules/billing/events";

/** The payment log: what Razorpay (or a product's checkout) told Ops, newest first. Times are IST. */
export function PaymentLog({ rows }: { rows: Awaited<ReturnType<typeof listRazorpayEvents>> }) {
  if (rows.length === 0) return <Empty>Nothing from Razorpay yet.</Empty>;
  return (
    <Table head={["When", "Event", "Amount", "Status", "Reason"]}>
      {rows.map((row) => {
        const { amount, status, reason } = describeRazorpayEvent(row);
        return (
          <tr key={row.id} data-testid="payment-log-row">
            <td className="whitespace-nowrap">{formatWhen(row.receivedAt)}</td>
            <td className="font-mono text-xs">{row.type}{row.source === "product" ? " (checkout)" : ""}</td>
            <td>{amount === null ? "—" : money(amount)}</td>
            <td>{status ? <Badge tone={row.error || status === "failed" || status === "declined" || status === "halted" ? "danger" : "neutral"}>{status}</Badge> : "—"}</td>
            <td className="text-sm text-muted-foreground">{reason ?? "—"}</td>
          </tr>
        );
      })}
    </Table>
  );
}
