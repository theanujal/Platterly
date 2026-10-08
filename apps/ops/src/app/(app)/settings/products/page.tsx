import Link from "next/link";
import { prisma } from "@/lib/db";
import { Badge, Empty, PageHeader, Table, formatWhen } from "@/components/ui";
import { RegisterForm } from "./register-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Products" };

export default async function ProductsPage() {
  const products = await prisma.product.findMany({ orderBy: { createdAt: "asc" }, include: { _count: { select: { businesses: true } } } });
  return (
    <>
      <PageHeader title="Products" description="Every product ops controls. Each has its own app and its own database." />
      <RegisterForm />
      {products.length === 0 ? (
        <Empty>No products registered yet.</Empty>
      ) : (
        <Table head={["Product", "Status", "Manifest", "Businesses", "Base URL"]}>
          {products.map((p) => (
            <tr key={p.key}>
              <td><Link className="font-medium text-accent-foreground hover:underline" href={`/settings/products/${p.key}`}>{p.name}</Link><div className="font-mono text-xs text-muted-foreground">{p.key}</div></td>
              <td><Badge tone={p.status === "ACTIVE" ? "success" : "neutral"}>{p.status === "ACTIVE" ? "Active" : "Disabled"}</Badge></td>
              <td>{p.manifestError ? <Badge tone="danger">Error</Badge> : p.manifestVersion ? <span>v{p.manifestVersion}<div className="text-xs text-muted-foreground">{formatWhen(p.manifestFetchedAt)}</div></span> : <Badge tone="warning">Not read yet</Badge>}</td>
              <td>{p._count.businesses}</td>
              <td className="font-mono text-xs">{p.baseUrl}</td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
