import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { getSupplierProfile } from "@/modules/suppliers/supplier";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActiveBadge, formatRupees } from "@/components/catalog/catalog-display";
import { EXPENSE_CATEGORY_LABEL } from "@/modules/expenses/profitability";

export const metadata: Metadata = {
  title: "Supplier — Platterly",
  robots: { index: false, follow: false },
};

export default async function SupplierProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ inventory: ["view"] }, organizationId);
  const profile = await getSupplierProfile(organizationId, id);
  if (!profile) notFound();
  const { supplier, items, expenses, totalSpend } = profile;

  const details = [
    ["Contact person", supplier.contactPerson],
    ["Phone", supplier.phone],
    ["Email", supplier.email],
    ["Address", supplier.address],
    ["GSTIN", supplier.gstin],
  ] as const;

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Suppliers", href: "/suppliers" }, { label: supplier.name }]} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{supplier.name}</h1>
          <p className="text-sm text-muted-foreground">Total spent: {formatRupees(totalSpend)}</p>
        </div>
        <ActiveBadge active={supplier.isActive} />
      </div>
      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {details.map(([label, value]) => (
            <div key={label}>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-sm font-medium">{value ?? "—"}</p>
            </div>
          ))}
          {supplier.notes && (
            <div className="sm:col-span-2">
              <p className="text-xs text-muted-foreground">Notes</p>
              <p className="text-sm whitespace-pre-wrap">{supplier.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Items they supply ({items.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No inventory item points at this supplier yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>In stock</TableHead>
                  <TableHead>Cost / unit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>
                      {Number(item.stockCount)} {item.unit}
                    </TableCell>
                    <TableCell>{item.costPerUnit !== null ? `₹${Number(item.costPerUnit).toFixed(2)}` : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Purchase history</CardTitle>
          <p className="text-sm text-muted-foreground">Expenses booked against this supplier (latest 50). Purchase orders will appear here once Purchasing is built.</p>
        </CardHeader>
        <CardContent>
          {expenses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No expenses booked against this supplier yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Applies to</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{e.spentAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{EXPENSE_CATEGORY_LABEL[e.category]}</Badge>
                    </TableCell>
                    <TableCell>{e.orderId ? <Link href={`/orders/${e.orderId}`} className="hover:underline">Order</Link> : "Company"}</TableCell>
                    <TableCell className="text-right font-medium">{formatRupees(Number(e.amount))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
