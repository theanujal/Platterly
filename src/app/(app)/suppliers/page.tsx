import type { Metadata } from "next";
import Link from "next/link";
import { Truck } from "lucide-react";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { getActiveLocation } from "@/modules/locations/active-location";
import { listLocations } from "@/modules/locations/locations";
import { listProductOptions, listSuppliers } from "@/modules/suppliers/supplier";
import { Badge } from "@/components/ui/badge";
import { TableCell } from "@/components/ui/table";
import { SectionTabs } from "@/components/app-shell/section-tabs";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { ActiveBadge, CATALOG_GRID_CLASSNAME, CatalogCardBody, CatalogCardMedia, formatRupees } from "@/components/catalog/catalog-display";
import { CatalogBrowser, type CatalogEntry, type CatalogFilterOption, type CatalogSortOption } from "@/components/catalog/catalog-browser";
import { AddSupplierDialog, SupplierCardActions } from "./_components/supplier-dialogs";
import type { SupplierFormValues } from "./_components/supplier-form";

export const metadata: Metadata = {
  title: "Suppliers — Caterly",
  robots: { index: false, follow: false },
};

export default async function SuppliersPage() {
  const { organizationId, session } = await requireActiveOrganization();
  await requirePermission({ inventory: ["view"] }, organizationId);
  const active = await getActiveLocation(organizationId, session.user.id);
  const [suppliers, productOptions, allLocations] = await Promise.all([listSuppliers(organizationId), listProductOptions(organizationId), active.enabled ? listLocations(organizationId) : Promise.resolve([])]);
  // For the New Inventory Item form opened from Products Supplied; null while multiple locations are off.
  const locations = active.enabled ? allLocations.map((l) => ({ id: l.id, name: l.name })) : null;

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
      products: s.products,
    };
    const supplies = `${s._count.inventoryItems} item${s._count.inventoryItems === 1 ? "" : "s"}`;
    return {
      id: s.id,
      searchText: `${s.name} ${s.contactPerson ?? ""} ${s.phone ?? ""} ${s.email ?? ""}`,
      filterValues: { status: s.isActive ? "Active" : "Inactive" },
      sortValues: { name: s.name, spend: s.totalSpend, newest: s.createdAt.getTime() },
      card: (
        <>
          <CatalogCardMedia src={null} icon={Truck} overlay={<SupplierCardActions id={s.id} name={s.name} initialValues={initialValues} productOptions={productOptions} locations={locations} />} />
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
              <SupplierCardActions id={s.id} name={s.name} initialValues={initialValues} productOptions={productOptions} locations={locations} variant="plain" />
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
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Stock & Supplies" }]} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Stock & Supplies</h1>
          <p className="text-sm text-muted-foreground">Who you buy from. Pick them on inventory items and expenses.</p>
        </div>
        <AddSupplierDialog productOptions={productOptions} locations={locations} />
      </div>
      <SectionTabs group="stock" active="/suppliers" organizationId={organizationId} />
      <CatalogBrowser
        entries={entries}
        addTile={<AddSupplierDialog variant="tile" productOptions={productOptions} locations={locations} />}
        columns={["Supplier", "Contact", "Phone", "Supplies", "Spend", "Status", "Actions"]}
        richList
        gridColumnsClassName={CATALOG_GRID_CLASSNAME}
        searchPlaceholder="Search suppliers…"
        emptyLabel="No suppliers yet."
        filterOptions={filterOptions}
        sortOptions={sortOptions}
        defaultView="list"
      />
    </div>
  );
}
