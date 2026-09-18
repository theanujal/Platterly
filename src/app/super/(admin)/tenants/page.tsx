import Link from "next/link";
import { requireSuperAdminOrRedirect } from "../../_lib/guard";
import { listTenants } from "@/modules/tenants/tenant";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { TenantStatus } from "@/generated/prisma/enums";

const STATUS_FILTERS: { label: string; value?: TenantStatus }[] = [
  { label: "All" },
  { label: "Active", value: "ACTIVE" },
  { label: "Suspended", value: "SUSPENDED" },
  { label: "Deactivated", value: "DEACTIVATED" },
];

// Chunk 3 Group 3.2 — Caterer (tenant) list, PRD §8.2.
export default async function TenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireSuperAdminOrRedirect();
  const { status } = await searchParams;
  const activeFilter = STATUS_FILTERS.find((f) => f.value === status)?.value;

  const tenants = await listTenants(activeFilter ? { status: activeFilter } : undefined);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Caterers</h1>
        <Button render={<Link href="/super/tenants/new">New Caterer</Link>} nativeButton={false} />
      </div>

      <div className="flex gap-2">
        {STATUS_FILTERS.map((filter) => (
          <Link
            key={filter.label}
            href={filter.value ? `/super/tenants?status=${filter.value}` : "/super/tenants"}
            className={
              activeFilter === filter.value
                ? "rounded-md bg-primary px-2.5 py-1 text-sm text-primary-foreground"
                : "rounded-md px-2.5 py-1 text-sm text-neutral-600 hover:bg-muted"
            }
          >
            {filter.label}
          </Link>
        ))}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tenants.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-sm text-neutral-500">
                No caterers yet.
              </TableCell>
            </TableRow>
          )}
          {tenants.map((tenant) => (
            <TableRow key={tenant.id}>
              <TableCell>
                <Link href={`/super/tenants/${tenant.id}`} className="font-medium hover:underline">
                  {tenant.name}
                </Link>
                {tenant.name === "Unnamed Business" && (
                  <span className="ml-2 text-xs text-neutral-500">(setup incomplete)</span>
                )}
              </TableCell>
              <TableCell className="text-neutral-500">{tenant.slug}</TableCell>
              <TableCell>
                <Badge variant={tenant.status === "ACTIVE" ? "success" : tenant.status === "SUSPENDED" ? "danger" : "neutral"}>{tenant.status}</Badge>
              </TableCell>
              <TableCell>{[tenant.ownerFirstName, tenant.ownerLastName].filter(Boolean).join(" ") || "—"}</TableCell>
              <TableCell>{tenant.createdAt.toLocaleDateString()}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
