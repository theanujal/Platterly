import Link from "next/link";
import { Badge, Button, Empty, PageHeader, Table, formatWhen, inputClass } from "@/components/ui";
import { listBusinesses } from "@/modules/directory/businesses";

export const dynamic = "force-dynamic";
export const metadata = { title: "Businesses" };

const STATUS_TONE = { ACTIVE: "success", SUSPENDED: "warning", PENDING_DELETE: "danger" } as const;
const STATUS_LABEL = { ACTIVE: "Active", SUSPENDED: "Suspended", PENDING_DELETE: "Pending delete" } as const;

export default async function BusinessesPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const { q, page } = await searchParams;
  const result = await listBusinesses({ q, page: Number(page) || 1 });
  const link = (p: number) => `/businesses?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;

  return (
    <>
      <PageHeader title="Businesses" description="Every business across every product." />
      <form className="mb-4 flex gap-2" role="search">
        <input name="q" defaultValue={q ?? ""} placeholder="Search by name or owner email" aria-label="Search businesses" className={`${inputClass} max-w-sm`} />
        <Button type="submit" variant="outline">Search</Button>
      </form>
      {result.rows.length === 0 ? (
        <Empty>{q ? "No business matches that search." : "No businesses yet. They appear here when a product reports a sign-up."}</Empty>
      ) : (
        <Table head={["Business", "Owner", "Products", "Status", "Joined"]}>
          {result.rows.map((b) => (
            <tr key={b.id}>
              <td><Link className="font-medium text-accent-foreground hover:underline" href={`/businesses/${b.id}`}>{b.name}</Link></td>
              <td>{b.ownerName ?? "—"}<div className="text-xs text-muted-foreground">{b.ownerEmail ?? ""}</div></td>
              <td>{b.products.map((p) => p.product.name).join(", ") || "—"}</td>
              <td><Badge tone={STATUS_TONE[b.status]}>{STATUS_LABEL[b.status]}</Badge></td>
              <td>{formatWhen(b.createdAt)}</td>
            </tr>
          ))}
        </Table>
      )}
      {result.pages > 1 ? (
        <nav aria-label="Pages" className="mt-4 flex items-center gap-3 text-sm">
          {result.page > 1 ? <Link className="text-accent-foreground hover:underline" href={link(result.page - 1)}>Previous</Link> : null}
          <span className="text-muted-foreground">Page {result.page} of {result.pages} ({result.total} businesses)</span>
          {result.page < result.pages ? <Link className="text-accent-foreground hover:underline" href={link(result.page + 1)}>Next</Link> : null}
        </nav>
      ) : null}
    </>
  );
}
