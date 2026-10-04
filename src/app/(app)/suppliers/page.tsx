import type { Metadata } from "next";
import Link from "next/link";
import { Truck } from "lucide-react";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { listSuppliers } from "@/modules/suppliers/supplier";
import { Badge } from "@/components/ui/badge";
import { TableCell } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { ActiveBadge, CATALOG_GRID_CLASSNAME, CatalogCardBody, CatalogCardMedia, formatRupees } from "@/components/catalog/catalog-display";
import { CatalogBrowser, type CatalogEntry, type CatalogFilterOption, type CatalogSortOption } from "@/components/catalog/catalog-browser";
import { AddSupplierDialog, SupplierCardActions } from "./_components/supplier-dialogs";
import type { SupplierFormValues } from "./_components/supplier-form";

export const metadata: Metadata = {
  title: "Suppliers — Platterly",
  robots: { index: false, follow: false },
};

export default async function SuppliersPage() {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ inventory: ["view"] }, organizationId);
  const suppliers = await listSuppliers(organizationId);

  const entries: CatalogEntry[] = suppliers.map((s) => {
    const initialValues: SupplierFormValues = {
      name: s.name,
      contactPerson: s.contactPerson ?? "",
      phone: s.phone ?? "",
      email: s.email ?? "",
      address: s.address ?? "",
      gstin: s.gstin ?? "",
      notes: s.notes ?? "",
      isActive: s.isActive,
    };
    const supplies = `${s._count.inventoryItems} item${s._count.inventoryItems === 1 ? "" : "s"}`;
    return {
      id: s.id,
      searchText: `${s.name} ${s.contactPerson ?? ""} ${s.phone ?? ""} ${s.email ?? ""}`,
      filterValues: { status: s.isActive ? "Active" : "Inactive" },
      sortValues: { name: s.name, spend: s.totalSpend, newest: s.createdAt.getTime() },
      card: (
        <>
          <CatalogCardMedia src={null} icon={Truck} overlay={<SupplierCardActions id={s.id} name={s.name} initialValues={initialValues} />} />
          <CatalogCardBody
            title={s.name}
            titleHref={`/suppliers/${s.id}`}
            description={[s.contactPerson, s.phone].filter(Boolean).join(" · ") || null}
            tags={<Badge variant="outline">Supplies: {supplies}</Badge>}
            footer={<span className="text-base font-semibold">{formatRupees(s.totalSpend)} spent</span>}
            active={s.isActive}
          />
        </>
      ),
      listRow: (
        <>
          <TableCell className="px-3 py-3">
            <Link href={`/suppliers/${s.id}`} className="font-medium hover:underline">
              {s.name}
            </Link>
          </TableCell>
          <TableCell className="px-3 py-3 text-sm text-muted-foreground">{s.contactPerson ?? "—"}</TableCell>
          <TableCell className="px-3 py-3 text-sm text-muted-foreground">{s.phone ?? "—"}</TableCell>
          <TableCell className="px-3 py-3 text-sm">{supplies}</TableCell>
          <TableCell className="px-3 py-3 text-sm font-semibold">{formatRupees(s.totalSpend)}</TableCell>
          <TableCell className="px-3 py-3">
            <ActiveBadge active={s.isActive} />
          </TableCell>
          <TableCell className="px-3 py-3">
            <div className="flex justify-end">
              <SupplierCardActions id={s.id} name={s.name} initialValues={initialValues} variant="plain" />
            </div>
          </TableCell>
        </>
      ),
    };
  });

  const filterOptions: CatalogFilterOption[] = [
    { key: "status", allLabel: "Status", options: [{ value: "Active", label: "Active" }, { value: "Inactive", label: "Inactive" }] },
  ];
  const sortOptions: CatalogSortOption[] = [
    { value: "name", label: "Name (A–Z)", key: "name" },
    { value: "newest", label: "Newest First", key: "newest", direction: "desc" },
    { value: "spend", label: "Spend (High–Low)", key: "spend", direction: "desc" },
  ];

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Suppliers" }]} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Suppliers</h1>
          <p className="text-sm text-muted-foreground">Who you buy from. Pick them on inventory items and expenses.</p>
        </div>
        <AddSupplierDialog />
      </div>
      <Separator />
      <CatalogBrowser
        entries={entries}
        addTile={<AddSupplierDialog variant="tile" />}
        columns={["Supplier", "Contact", "Phone", "Supplies", "Spend", "Status", "Actions"]}
        richList
        gridColumnsClassName={CATALOG_GRID_CLASSNAME}
        searchPlaceholder="Search suppliers…"
        emptyLabel="No suppliers yet."
        filterOptions={filterOptions}
        sortOptions={sortOptions}
        pageSize={16}
        defaultView="list"
      />
    </div>
  );
}
