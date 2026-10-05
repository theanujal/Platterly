import Link from "next/link";
import { prisma } from "@/lib/db";
import { Badge, Card, Empty, PageHeader, Table, formatWhen } from "@/components/ui";
import { listAlerts } from "@/modules/alerts/alerts";
import { getOverview } from "@/modules/dashboard/overview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview" };

export default async function OverviewPage() {
  const [overview, openAlerts, recent, alerts] = await Promise.all([
    getOverview(),
    prisma.alert.count({ where: { acknowledgedAt: null } }),
    prisma.business.findMany({ orderBy: { createdAt: "desc" }, take: 5, include: { products: true } }),
    listAlerts({ take: 5 }),
  ]);
  const b = overview.businesses;
  const s = overview.subscriptions;

  return (
    <>
      <PageHeader title="Overview" description="Every product and business in one place." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Businesses", value: b.total, hint: `${b.active} active · ${b.suspended} suspended${b.pendingDelete ? ` · ${b.pendingDelete} pending delete` : ""}`, href: "/businesses" },
          { label: "New this week", value: b.newThisWeek, hint: "Signed up in the last 7 days", href: "/reports?tab=signups" },
          { label: "Subscriptions", value: s.paying, hint: `paying · ${s.trialing} on trial · ${s.locked} locked`, href: "/reports?tab=subscriptions" },
          { label: "Open alerts", value: openAlerts, hint: "Need attention", href: "/alerts" },
        ].map((tile) => (
          <Link key={tile.label} href={tile.href}>
            <Card>
              <p className="text-sm text-muted-foreground">{tile.label}</p>
              <p className="mt-1 text-3xl font-semibold">{tile.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{tile.hint}</p>
            </Card>
          </Link>
        ))}
      </div>
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-base font-semibold">Products</h2>
          {overview.products.length === 0 ? (
            <Empty>No products registered yet.</Empty>
          ) : (
            <Table head={["Product", "Businesses", "Reported usage"]}>
              {overview.products.map((p) => (
                <tr key={p.key}>
                  <td><Link className="font-medium text-accent-foreground hover:underline" href={`/products/${p.key}`}>{p.name}</Link></td>
                  <td>{p.businesses}</td>
                  <td className="text-xs text-muted-foreground">{Object.entries(p.usage).map(([k, v]) => `${k} ${v.toLocaleString("en-IN")}`).join(" · ") || "—"}</td>
                </tr>
              ))}
            </Table>
          )}
        </div>
        <div>
          <h2 className="mb-3 text-base font-semibold">Trials ending soon</h2>
          {overview.trialsEndingSoon.length === 0 ? (
            <Empty>No trial ends in the next week.</Empty>
          ) : (
            <Table head={["Business", "Product", "Trial ends"]}>
              {overview.trialsEndingSoon.map((t) => (
                <tr key={t.businessId + t.productKey}>
                  <td><Link className="font-medium text-accent-foreground hover:underline" href={`/businesses/${t.businessId}`}>{t.name}</Link></td>
                  <td>{t.productKey}</td>
                  <td>{formatWhen(t.trialEndsAt)}</td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-base font-semibold">Newest businesses</h2>
          {recent.length === 0 ? (
            <Empty>No businesses yet. They appear here when a product reports a sign-up.</Empty>
          ) : (
            <Table head={["Business", "Products", "Joined"]}>
              {recent.map((b) => (
                <tr key={b.id}>
                  <td><Link className="font-medium text-accent-foreground hover:underline" href={`/businesses/${b.id}`}>{b.name}</Link></td>
                  <td>{b.products.map((p) => p.productKey).join(", ") || "—"}</td>
                  <td>{formatWhen(b.createdAt)}</td>
                </tr>
              ))}
            </Table>
          )}
        </div>
        <div>
          <h2 className="mb-3 text-base font-semibold">Latest alerts</h2>
          {alerts.length === 0 ? (
            <Empty>Nothing needs attention.</Empty>
          ) : (
            <Table head={["Alert", "Product", "When"]}>
              {alerts.map((a) => (
                <tr key={a.id}>
                  <td><Badge tone={a.severity === "CRITICAL" ? "danger" : a.severity === "WARNING" ? "warning" : "info"}>{a.code}</Badge></td>
                  <td>{a.product.name}</td>
                  <td>{formatWhen(a.createdAt)}</td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      </div>
    </>
  );
}
