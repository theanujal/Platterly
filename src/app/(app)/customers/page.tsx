import type { Metadata } from "next";
import { Users } from "lucide-react";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { listCustomers } from "@/modules/customers/customer";
import { Badge } from "@/components/ui/badge";
import { TableCell } from "@/components/ui/table";
import { CatalogBrowser, type CatalogEntry } from "@/components/catalog/catalog-browser";
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
      addressLine1: customer.addressLine1 ?? "",
      city: customer.city ?? "",
      state: customer.state ?? "",
      notes: customer.notes ?? "",
      isActive: customer.isActive,
    };

    return {
      id: customer.id,
      searchText: `${customer.name} ${customer.phone} ${customer.email ?? ""} ${customer.city ?? ""}`,
      card: (
        <div className="flex flex-col gap-1.5 p-4">
          <div className="flex items-start justify-between gap-2">
            <span className="flex items-center gap-1.5 font-medium">
              <Users className="size-4 text-muted-foreground" />
              {customer.name}
            </span>
            <div className="flex shrink-0 items-center gap-0.5">
              {!customer.isActive && <Badge variant="secondary">Inactive</Badge>}
              <CustomerCardActions customerId={customer.id} name={customer.name} initialValues={initialValues} />
            </div>
          </div>
          <span className="text-sm text-muted-foreground">{customer.phone}</span>
          {customer.email && <span className="text-xs text-muted-foreground">{customer.email}</span>}
          {(customer.city || customer.state) && (
            <span className="text-xs text-muted-foreground">{[customer.city, customer.state].filter(Boolean).join(", ")}</span>
          )}
        </div>
      ),
      listRow: (
        <>
          <TableCell className="font-medium">{customer.name}</TableCell>
          <TableCell>{customer.phone}</TableCell>
          <TableCell className="text-muted-foreground">{customer.email ?? "—"}</TableCell>
          <TableCell>
            <Badge variant={customer.isActive ? "default" : "secondary"}>{customer.isActive ? "Active" : "Inactive"}</Badge>
          </TableCell>
          <TableCell>
            <CustomerCardActions customerId={customer.id} name={customer.name} initialValues={initialValues} />
          </TableCell>
        </>
      ),
    };
  });

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Customers</h1>
          <p className="text-sm text-muted-foreground">Your customer database — the record of everyone you&apos;ve catered for.</p>
        </div>
        <AddCustomerDialog />
      </div>

      <CatalogBrowser
        entries={entries}
        addTile={<AddCustomerDialog variant="tile" />}
        columns={["Name", "Phone", "Email", "Status", "Actions"]}
        searchPlaceholder="Search customers…"
        emptyLabel="No customers yet."
      />
    </div>
  );
}
