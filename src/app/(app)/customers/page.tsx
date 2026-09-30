import type { Metadata } from "next";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { listCustomers } from "@/modules/customers/customer";
import { prisma } from "@/lib/db";
import { canonicalUrl } from "@/lib/seo/canonical";
import { Separator } from "@/components/ui/separator";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { CatalogBrowser, type CatalogEntry, type CatalogFilterOption, type CatalogSortOption } from "@/components/catalog/catalog-browser";
import { AddCustomerDialog } from "./_components/add-customer-dialog";
import { EditCustomerDialog } from "./_components/edit-customer-dialog";
import { CustomerCard, CustomerListCells, buildMenuMessageHref, type CustomerDisplayData } from "./_components/customer-display";
import type { CustomerFormValues } from "./_components/customer-form";

export const metadata: Metadata = {
  title: "Customers — Platterly",
  robots: { index: false, follow: false },
};

export default async function CustomersPage() {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ customers: ["view"] }, organizationId);
  const [customers, organization] = await Promise.all([
    listCustomers(organizationId),
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true, slug: true, slugChangeCount: true } }),
  ]);
  const menuUrl = organization.slugChangeCount > 0 ? canonicalUrl(`/${organization.slug}`) : null;

  const entries: CatalogEntry[] = customers.map((customer) => {
    const initialValues: CustomerFormValues = {
      name: customer.name,
      phone: customer.phone,
      email: customer.email ?? "",
      notes: customer.notes ?? "",
      isActive: customer.isActive,
      isEnquiry: customer.isEnquiry,
      leadSource: customer.leadSource ?? "MANUAL_ENTRY",
    };

    const display: CustomerDisplayData = {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      status: customer.status,
      isActive: customer.isActive,
      orderCount: customer.orderCount,
      lastOrderAt: customer.lastOrderAt,
    };
    const menuHref = buildMenuMessageHref(customer, organization.name, menuUrl);
    const editAction = <EditCustomerDialog customerId={customer.id} name={customer.name} initialValues={initialValues} />;

    return {
      id: customer.id,
      href: `/customers/${customer.id}`,
      cardOwnsLink: true,
      searchText: `${customer.name} ${customer.phone} ${customer.email ?? ""}`,
      filterValues: { activeStatus: customer.isActive ? "ACTIVE" : "INACTIVE", recordStatus: customer.status },
      sortValues: { name: customer.name, newest: customer.createdAt.getTime() },
      card: <CustomerCard customer={display} menuHref={menuHref} editAction={editAction} />,
      listRow: <CustomerListCells customer={display} menuHref={menuHref} editAction={editAction} />,
    };
  });

  const filterOptions: CatalogFilterOption[] = [
    {
      key: "recordStatus",
      allLabel: "All",
      options: [
        { value: "LEAD", label: "Leads" },
        { value: "CUSTOMER", label: "Customers" },
      ],
    },
    {
      key: "activeStatus",
      allLabel: "Status",
      options: [
        { value: "ACTIVE", label: "Active" },
        { value: "INACTIVE", label: "Inactive" },
      ],
    },
  ];

  const sortOptions: CatalogSortOption[] = [
    { value: "newest", label: "Newest First", key: "newest", direction: "desc" },
    { value: "name", label: "Name (A–Z)", key: "name" },
  ];

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Customers" }]} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Customers</h1>
          <p className="text-sm text-muted-foreground">Leads and customers — every person you&apos;ve enquired with or catered for, in one place.</p>
        </div>
        <AddCustomerDialog />
      </div>
      <Separator />

      <CatalogBrowser
        entries={entries}
        addTile={<AddCustomerDialog variant="tile" />}
        columns={["Customer", "Contact", "Status", "Total Orders", "Last Order", ""]}
        richList
        gridColumnsClassName="grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
        searchPlaceholder="Search customers…"
        emptyLabel="No customers yet."
        filterOptions={filterOptions}
        sortOptions={sortOptions}
        pageSize={16}
      />
    </div>
  );
}
