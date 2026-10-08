import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, Empty, Table, formatWhen } from "@/components/ui";
import { prisma } from "@/lib/db";
import { Tabs } from "@/components/tabs";
import { getBusiness, getBusinessActivity } from "@/modules/directory/businesses";
import { Avatar } from "../business-views";
import { listSubscriptions } from "@/modules/subscriptions/subscriptions";
import { AssignForm } from "./assign-form";
import { IdentityForm, ProviderButtons, StatusControls } from "./lifecycle-forms";

export const dynamic = "force-dynamic";

export default async function BusinessPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const TABS = ["overview", "subscription", "usage", "activity", "messages"] as const;
  const wanted = (await searchParams).tab;
  const tab = TABS.find((t) => t === wanted) ?? "overview";
  const business = await getBusiness(id);
  if (!business) notFound();
  const [subscriptions, plans, activity] = await Promise.all([listSubscriptions(id), prisma.plan.findMany({ where: { isActive: true, productKey: { in: business.products.map((p) => p.productKey) } }, orderBy: [{ isTrial: "desc" }, { priceMonthly: "asc" }] }), getBusinessActivity(id)]);
  const when = (d: Date | null) => (d ? formatWhen(d) : "—");
  const actionsOf = (manifest: unknown): string[] => ((manifest as { actions?: string[] } | null)?.actions ?? []);
  const STATUS_TONE = { TRIALING: "info", ACTIVE: "success", PAST_DUE: "warning", LOCKED: "danger", CANCELLED: "neutral" } as const;

  const statusLabel = business.status === "PENDING_DELETE" ? "Pending delete" : business.status === "SUSPENDED" ? "Suspended" : "Active";
  const usageRows = business.products.map((bp) => ({ bp, counts: ((bp.usage as { counts?: Record<string, number> } | null)?.counts ?? {}) }));

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-4 rounded-[14px] bg-card p-5 shadow-[0_0_0_1px_rgba(17,24,39,0.1)]">
        <Avatar name={business.name} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold">{business.name}</h1>
          <p className="text-sm text-muted-foreground">{business.ownerName ?? "Owner unknown"} · {business.ownerEmail ?? "no email"}</p>
          <p className="font-mono text-xs text-muted-foreground">{business.id}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={business.status === "ACTIVE" ? "success" : business.status === "SUSPENDED" ? "warning" : "danger"}>{statusLabel}</Badge>
          {business.products.map((bp) => <Badge key={bp.productKey}>{bp.product.name}</Badge>)}
          <Link href="/businesses" className="text-sm text-accent-foreground hover:underline">All businesses</Link>
        </div>
      </div>
      <Tabs base={`/businesses/${business.id}`} current={tab} tabs={[{ id: "overview", label: "Overview" }, { id: "subscription", label: "Subscription" }, { id: "usage", label: "Usage" }, { id: "activity", label: "Activity", count: activity.audit.length + business.notifications.length }, { id: "messages", label: "Messages", count: activity.messages.length }]} />
      <div className="mt-6">
        {tab === "overview" ? (
          <>
      <h2 className="mb-3 text-base font-semibold">Status</h2>
      <div className="mb-8">
        {business.products.length > 0 ? <StatusControls businessId={business.id} productKey={business.products[0].productKey} businessName={business.name} status={business.status} deleteAfter={business.deleteAfter ? formatWhen(business.deleteAfter) : null} /> : <Empty>Not on any product.</Empty>}
      </div>

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
                <details className="mb-3 text-sm">
                  <summary className="cursor-pointer font-medium">Change details{actionsOf(bp.product.manifest).includes("provider") ? " and message providers" : ""}</summary>
                  <div className="mt-3 grid gap-4">
                    <IdentityForm businessId={business.id} productKey={bp.productKey} name={business.name} ownerName={business.ownerName ?? ""} ownerEmail={business.ownerEmail ?? ""} hasSlug={actionsOf(bp.product.manifest).includes("slug")} />
                    {actionsOf(bp.product.manifest).includes("provider") ? <ProviderButtons businessId={business.id} productKey={bp.productKey} /> : null}
                  </div>
                </details>
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

          </>
        ) : null}

        {tab === "subscription" ? (
          <>
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

            <h2 className="mb-3 text-base font-semibold">Payments</h2>
            {activity.payments.length === 0 ? <Empty>No payments yet.</Empty> : (
              <Table head={["Invoice", "Plan", "Total", "Paid"]}>
                {activity.payments.map((p) => (
                  <tr key={p.id}><td><Link className="font-mono text-xs font-medium text-accent-foreground hover:underline" href={`/payments/${p.id}`}>{p.invoiceNumber ?? "—"}</Link></td><td>{p.plan.name}</td><td>₹{Number(p.total).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td><td>{formatWhen(p.paidAt)}</td></tr>
                ))}
              </Table>
            )}
          </>
        ) : null}

        {tab === "usage" ? (
          usageRows.length === 0 ? <Empty>Not on any product.</Empty> : (
            <div className="grid gap-4 lg:grid-cols-2">
              {usageRows.map(({ bp, counts }) => (
                <Card key={bp.productKey}>
                  <p className="font-semibold">{bp.product.name}</p>
                  <p className="mb-4 text-xs text-muted-foreground">Last active {formatWhen(bp.lastActiveAt)} · usage reported {formatWhen(bp.usageReportedAt)}</p>
                  {Object.keys(counts).length === 0 ? <p className="text-sm text-muted-foreground">No usage reported yet.</p> : (
                    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                      {Object.entries(counts).map(([k, v]) => <div key={k} className="rounded-xl bg-muted p-3"><dt className="text-xs capitalize text-muted-foreground">{k}</dt><dd className="text-2xl font-semibold">{v.toLocaleString("en-IN")}</dd></div>)}
                    </dl>
                  )}
                </Card>
              ))}
            </div>
          )
        ) : null}

        {tab === "activity" ? (
          <div className="grid gap-8">
      <section><h2 className="mb-3 text-base font-semibold">Notifications</h2>
      {business.notifications.length === 0 ? (
        <Empty>No notifications for this business.</Empty>
      ) : (
        <Table head={["Notification", "Message", "When"]}>
          {business.notifications.map((a) => (
            <tr key={a.id}><td><Badge tone={a.severity === "CRITICAL" ? "danger" : a.severity === "WARNING" ? "warning" : "info"}>{a.title}</Badge></td><td>{a.body}</td><td>{formatWhen(a.createdAt)}</td></tr>
          ))}
        </Table>
      )}</section>
            <section>
              <h2 className="mb-3 text-base font-semibold">What staff and the system did</h2>
              {activity.audit.length === 0 ? <Empty>Nothing recorded yet.</Empty> : (
                <Table head={["Action", "By", "When"]}>
                  {activity.audit.map((a) => <tr key={a.id}><td className="font-mono text-xs">{a.action}</td><td>{a.actor?.name ?? "System"}</td><td>{formatWhen(a.createdAt)}</td></tr>)}
                </Table>
              )}
            </section>
          </div>
        ) : null}

        {tab === "messages" ? (
          activity.messages.length === 0 ? <Empty>No emails sent to this business yet.</Empty> : (
            <Table head={["Email", "To", "Status", "When"]}>
              {activity.messages.map((m) => (
                <tr key={m.id}>
                  <td>{m.subject ?? m.template}<div className="font-mono text-xs text-muted-foreground">{m.template}</div></td>
                  <td>{m.toEmail ?? "—"}</td>
                  <td><Badge tone={m.status === "SENT" ? "success" : m.status === "FAILED" ? "danger" : m.status === "SKIPPED" ? "neutral" : "warning"}>{m.status.toLowerCase()}</Badge>{m.error ? <div className="max-w-xs text-xs text-destructive">{m.error}</div> : null}</td>
                  <td>{formatWhen(m.sentAt ?? m.createdAt)}</td>
                </tr>
              ))}
            </Table>
          )
        ) : null}
      </div>
    </>
  );
}
