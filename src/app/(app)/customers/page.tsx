import type { Metadata } from "next";
import { Users } from "lucide-react";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { listCustomers } from "@/modules/customers/customer";
import { formatPhoneDisplay } from "@/lib/phone";
import { Badge } from "@/components/ui/badge";
import { TableCell } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { CatalogBrowser, type CatalogEntry, type CatalogFilterOption, type CatalogSortOption } from "@/components/catalog/catalog-browser";
import { AddCustomerDialog } from "./_components/add-customer-dialog";
import { CustomerCardActions } from "./_components/customer-card-actions";
import type { CustomerFormValues } from "./_components/customer-form";

export const metadata: Metadata = {
  title: "Customers — Platterly",
  robots: { index: false, follow: false },
};

export default async function CustomersPage() {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ customers: ["view"] }, organizationId);
  const customers = await listCustomers(organizationId);

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

    return {
      id: customer.id,
      searchText: `${customer.name} ${customer.phone} ${customer.email ?? ""}`,
      filterValues: { activeStatus: customer.isActive ? "ACTIVE" : "INACTIVE", recordStatus: customer.status },
      sortValues: { name: customer.name, newest: customer.createdAt.getTime() },
      card: (
        <div className="flex flex-col gap-1.5 p-4">
          <div className="flex items-start justify-between gap-2">
            <span className="flex items-center gap-1.5 font-medium">
              <Users className="size-4 text-muted-foreground" />
              {customer.name}
            </span>
            <div className="flex shrink-0 items-center gap-0.5">
              {!customer.isActive && <Badge variant="neutral">Inactive</Badge>}
              <CustomerCardActions customerId={customer.id} name={customer.name} initialValues={initialValues} />
            </div>
          </div>
          <span className="text-sm text-muted-foreground">{formatPhoneDisplay(customer.phone)}</span>
          {customer.email && <span className="text-xs text-muted-foreground">{customer.email}</span>}
          <Badge variant={customer.status === "CUSTOMER" ? "success" : "neutral"} className="w-fit">
            {customer.status === "CUSTOMER" ? "Customer" : "Lead"}
          </Badge>
        </div>
      ),
      listRow: (
        <>
          <TableCell className="font-medium">{customer.name}</TableCell>
          <TableCell>{formatPhoneDisplay(customer.phone)}</TableCell>
          <TableCell className="text-muted-foreground">{customer.email ?? "—"}</TableCell>
          <TableCell>
            <Badge variant={customer.status === "CUSTOMER" ? "success" : "neutral"}>
              {customer.status === "CUSTOMER" ? "Customer" : "Lead"}
            </Badge>
          </TableCell>
          <TableCell>
            <Badge variant={customer.isActive ? "success" : "neutral"}>{customer.isActive ? "Active" : "Inactive"}</Badge>
          </TableCell>
          <TableCell>
            <CustomerCardActions customerId={customer.id} name={customer.name} initialValues={initialValues} />
          </TableCell>
        </>
      ),
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
        columns={["Name", "Phone", "Email", "Status", "Active", "Actions"]}
        searchPlaceholder="Search customers…"
        emptyLabel="No customers yet."
        filterOptions={filterOptions}
        sortOptions={sortOptions}
        pageSize={16}
      />
    </div>
  );
}
