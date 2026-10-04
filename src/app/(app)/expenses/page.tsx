import type { Metadata } from "next";
import { requireActiveOrganization, requirePermission, hasPermission } from "@/lib/auth/require-session";
import { listExpenses, listOrderOptions } from "@/modules/expenses/expense";
import { listSupplierOptions } from "@/modules/suppliers/supplier";
import { generateDueRecurringExpenses } from "@/modules/expenses/recurring";
import { ExportMenu } from "@/components/reports/export-menu";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { ExpensesBrowser } from "./_components/expenses-browser";

export const metadata: Metadata = {
  title: "Expenses — Platterly",
  robots: { index: false, follow: false },
};

export default async function ExpensesPage() {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ expenses: ["view"] }, organizationId);
  // No background scheduler yet: book whatever recurring expenses have fallen due before listing anything.
  await generateDueRecurringExpenses(organizationId);
  const [expenses, orders, supplierOptions, canCreate, canEdit, canDelete, canExport] = await Promise.all([
    listExpenses(organizationId),
    listOrderOptions(organizationId),
    listSupplierOptions(organizationId),
    hasPermission({ expenses: ["create"] }, organizationId),
    hasPermission({ expenses: ["edit"] }, organizationId),
    hasPermission({ expenses: ["delete"] }, organizationId),
    hasPermission({ reports: ["export"] }, organizationId),
  ]);

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Expenses" }]} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Expenses</h1>
          <p className="text-sm text-muted-foreground">Everything the business spends: costs of an order&apos;s event, and company expenses such as rent and salaries that belong to no order.</p>
        </div>
        {canExport && <ExportMenu href="/expenses/export" />}
      </div>
      <Separator />
      <ExpensesBrowser
        rows={expenses.map((e) => ({
          id: e.id,
          orderId: e.orderId,
          orderLabel: e.orderNumber ? `${e.orderNumber} · ${e.customerName}` : null,
          category: e.category,
          amount: e.amount,
          spentAt: e.spentAt.toISOString(),
          paymentMethod: e.paymentMethod,
          supplierName: e.supplierName,
          supplierId: e.supplierId,
          notes: e.notes,
          recurringExpenseId: e.recurringExpenseId,
          recurring: e.recurring ? { frequency: e.recurring.frequency, isActive: e.recurring.isActive, startDate: e.recurring.startDate.toISOString(), endDate: e.recurring.endDate ? e.recurring.endDate.toISOString() : null, nextDue: e.recurring.nextDue ? e.recurring.nextDue.toISOString() : null } : null,
          attachments: e.attachments,
        }))}
        orderOptions={orders.map((o) => ({ id: o.id, label: o.label }))}
        suppliers={supplierOptions}
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={canDelete}
      />
    </div>
  );
}
