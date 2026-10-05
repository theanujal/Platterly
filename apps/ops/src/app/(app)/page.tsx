import Link from "next/link";
import { prisma } from "@/lib/db";
import { Badge, Card, Empty, PageHeader, Table, formatWhen } from "@/components/ui";
import { listAlerts } from "@/modules/alerts/alerts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview" };

export default async function OverviewPage() {
  const [products, businesses, openAlerts, recent, alerts] = await Promise.all([
    prisma.product.count({ where: { status: "ACTIVE" } }),
    prisma.business.count(),
    prisma.alert.count({ where: { acknowledgedAt: null } }),
    prisma.business.findMany({ orderBy: { createdAt: "desc" }, take: 5, include: { products: true } }),
    listAlerts({ take: 5 }),
  ]);

  return (
    <>
      <PageHeader title="Overview" description="Every product and business in one place." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {[
          { label: "Products", value: products, href: "/products" },
          { label: "Businesses", value: businesses, href: "/businesses" },
          { label: "Open alerts", value: openAlerts, href: "/alerts" },
        ].map((tile) => (
          <Link key={tile.label} href={tile.href}>
            <Card>
              <p className="text-sm text-muted-foreground">{tile.label}</p>
              <p className="mt-1 text-3xl font-semibold">{tile.value}</p>
            </Card>
          </Link>
        ))}
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
