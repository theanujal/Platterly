import { notFound } from "next/navigation";
import { Badge, Card, Empty, PageHeader, Table, formatWhen } from "@/components/ui";
import { prisma } from "@/lib/db";
import { getBusiness } from "@/modules/directory/businesses";
import { listSubscriptions } from "@/modules/subscriptions/subscriptions";
import { AssignForm } from "./assign-form";

export const dynamic = "force-dynamic";

export default async function BusinessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const business = await getBusiness(id);
  if (!business) notFound();
  const [subscriptions, plans] = await Promise.all([listSubscriptions(id), prisma.plan.findMany({ where: { isActive: true, productKey: { in: business.products.map((p) => p.productKey) } }, orderBy: [{ isTrial: "desc" }, { priceMonthly: "asc" }] })]);
  const when = (d: Date | null) => (d ? formatWhen(d) : "—");
  const STATUS_TONE = { TRIALING: "info", ACTIVE: "success", PAST_DUE: "warning", LOCKED: "danger", CANCELLED: "neutral" } as const;

  return (
    <>
      <PageHeader title={business.name} description={`${business.ownerName ?? "Owner unknown"} · ${business.ownerEmail ?? "no email"}`} actions={<Badge tone={business.status === "ACTIVE" ? "success" : business.status === "SUSPENDED" ? "warning" : "danger"}>{business.status === "PENDING_DELETE" ? "Pending delete" : business.status === "SUSPENDED" ? "Suspended" : "Active"}</Badge>} />
      <p className="mb-6 font-mono text-xs text-muted-foreground">{business.id}</p>

      <h2 className="mb-3 text-base font-semibold">Products</h2>
      {business.products.length === 0 ? (
        <Empty>Not on any product.</Empty>
      ) : (
        <div className="mb-8 grid gap-4 sm:grid-cols-2">
          {business.products.map((bp) => {
            const counts = (bp.usage as { counts?: Record<string, number> } | null)?.counts ?? {};
            return (
              <Card key={bp.productKey}>
                <p className="font-semibold">{bp.product.name}</p>
                <p className="mb-3 text-xs text-muted-foreground">Last active {formatWhen(bp.lastActiveAt)} · usage reported {formatWhen(bp.usageReportedAt)}</p>
                {Object.keys(counts).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No usage reported yet.</p>
                ) : (
                  <dl className="grid grid-cols-3 gap-2 text-sm">
                    {Object.entries(counts).map(([k, v]) => (
                      <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-semibold">{v}</dd></div>
                    ))}
                  </dl>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <h2 className="mb-3 text-base font-semibold">Subscriptions</h2>
      {business.products.length === 0 ? (
        <Empty>Not on any product.</Empty>
      ) : (
        <div className="mb-8 grid gap-4">
          {business.products.map((bp) => {
            const rows = subscriptions.filter((sub) => sub.productKey === bp.productKey);
            const current = rows.find((sub) => sub.endDate === null) ?? null;
            return (
              <Card key={bp.productKey}>
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <p className="font-semibold">{bp.product.name}</p>
                  {current ? <Badge tone={STATUS_TONE[current.status]}>{current.plan.name} · {current.status.toLowerCase().replace("_", " ")}</Badge> : <Badge tone="warning">No subscription</Badge>}
                  <span className="text-xs text-muted-foreground">Snapshot version {bp.snapshotVersion}{bp.snapshotIssuedAt ? `, issued ${formatWhen(bp.snapshotIssuedAt)}` : ", none issued"}</span>
                </div>
                {current ? (
                  <dl className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div><dt className="text-xs text-muted-foreground">Started</dt><dd>{when(current.startDate)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Trial ends</dt><dd>{when(current.trialEndsAt)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Paid until</dt><dd>{when(current.currentPeriodEnd)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Interval</dt><dd>{current.billingInterval ? current.billingInterval.toLowerCase() : "—"}</dd></div>
                  </dl>
                ) : null}
                <AssignForm businessId={business.id} productKey={bp.productKey} currentPlanId={current?.planId ?? null} plans={plans.filter((p) => p.productKey === bp.productKey).map((p) => ({ id: p.id, label: `${p.name}${p.isTrial ? " (trial)" : ""}` }))} />
                {rows.length > 1 ? (
                  <details className="mt-4 text-sm">
                    <summary className="cursor-pointer text-muted-foreground">History ({rows.length})</summary>
                    <ul className="mt-2 space-y-1">
                      {rows.map((sub) => <li key={sub.id}>{sub.plan.name} · {sub.status.toLowerCase().replace("_", " ")} · {formatWhen(sub.startDate)} to {sub.endDate ? formatWhen(sub.endDate) : "now"}</li>)}
                    </ul>
                  </details>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      <h2 className="mb-3 text-base font-semibold">Recent alerts</h2>
      {business.alerts.length === 0 ? (
        <Empty>No alerts for this business.</Empty>
      ) : (
        <Table head={["Alert", "Message", "When"]}>
          {business.alerts.map((a) => (
            <tr key={a.id}><td><Badge tone={a.severity === "CRITICAL" ? "danger" : a.severity === "WARNING" ? "warning" : "info"}>{a.code}</Badge></td><td>{a.message}</td><td>{formatWhen(a.createdAt)}</td></tr>
          ))}
        </Table>
      )}
    </>
  );
}
