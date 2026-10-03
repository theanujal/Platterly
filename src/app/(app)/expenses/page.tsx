import type { Metadata } from "next";
import { requireActiveOrganization, requirePermission, hasPermission } from "@/lib/auth/require-session";
import { listExpenses, listOrderOptions } from "@/modules/expenses/expense";
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
  const [expenses, orders, canCreate, canEdit, canDelete] = await Promise.all([
    listExpenses(organizationId),
    listOrderOptions(organizationId),
    hasPermission({ expenses: ["create"] }, organizationId),
    hasPermission({ expenses: ["edit"] }, organizationId),
    hasPermission({ expenses: ["delete"] }, organizationId),
  ]);

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Expenses" }]} />
      <div>
        <h1 className="text-2xl font-semibold">Expenses</h1>
        <p className="text-sm text-muted-foreground">Everything the business spends: costs of an order&apos;s event, and company expenses such as rent and salaries that belong to no order.</p>
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
          notes: e.notes,
        }))}
        orderOptions={orders.map((o) => ({ id: o.id, label: o.label }))}
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={canDelete}
      />
    </div>
  );
}
