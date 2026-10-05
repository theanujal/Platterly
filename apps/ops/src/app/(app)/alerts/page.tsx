import Link from "next/link";
import { Badge, Button, Empty, PageHeader, Table, formatWhen } from "@/components/ui";
import { listAlerts } from "@/modules/alerts/alerts";
import { acknowledgeAlertAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Alerts" };

export default async function AlertsPage() {
  const alerts = await listAlerts();
  return (
    <>
      <PageHeader title="Alerts" description="Raised by products. Acknowledge one when it has been handled." />
      {alerts.length === 0 ? (
        <Empty>Nothing needs attention.</Empty>
      ) : (
        <Table head={["Alert", "Message", "Product", "Business", "When", ""]}>
          {alerts.map((a) => (
            <tr key={a.id}>
              <td><Badge tone={a.severity === "CRITICAL" ? "danger" : a.severity === "WARNING" ? "warning" : "info"}>{a.code}</Badge></td>
              <td>{a.message}</td>
              <td>{a.product.name}</td>
              <td>{a.business ? <Link className="text-accent-foreground hover:underline" href={`/businesses/${a.business.id}`}>{a.business.name}</Link> : "—"}</td>
              <td>{formatWhen(a.createdAt)}</td>
              <td>
                <form action={acknowledgeAlertAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <Button type="submit" variant="outline" size="md">Acknowledge</Button>
                </form>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
