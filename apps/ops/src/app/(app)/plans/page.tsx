import Link from "next/link";
import { prisma } from "@/lib/db";
import { Badge, Empty, LinkButton, PageHeader, Table } from "@/components/ui";
import { listPlans } from "@/modules/plans/plans";

export const dynamic = "force-dynamic";
export const metadata = { title: "Plans" };

const money = (value: unknown) => (value === null || value === undefined ? "—" : `₹${Number(value).toLocaleString("en-IN")}`);

export default async function PlansPage() {
  const [plans, products] = await Promise.all([listPlans(), prisma.product.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } })]);
  return (
    <>
      <PageHeader title="Plans" description="What each product sells, and what each plan allows." actions={products.filter((p) => p.manifest).map((p) => <LinkButton key={p.key} href={`/plans/new?product=${p.key}`} size="md">New {p.name} plan</LinkButton>)} />
      {plans.length === 0 ? (
        <Empty>No plans yet. Register a product, read its manifest, then create its plans.</Empty>
      ) : (
        <Table head={["Plan", "Product", "Monthly", "Annual", "Businesses", "Status"]}>
          {plans.map((p) => (
            <tr key={p.id}>
              <td><Link className="font-medium text-accent-foreground hover:underline" href={`/plans/${p.id}`}>{p.name}</Link><div className="font-mono text-xs text-muted-foreground">{p.code}{p.isTrial ? " · trial" : ""}</div></td>
              <td>{p.product.name}</td>
              <td>{p.isTrial ? `${p.trialDurationDays} days free` : money(p.priceMonthly)}</td>
              <td>{p.isTrial ? "—" : money(p.priceAnnual)}</td>
              <td>{p._count.subscriptions}</td>
              <td><Badge tone={p.isActive ? "success" : "neutral"}>{p.isActive ? "Active" : "Retired"}</Badge></td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
