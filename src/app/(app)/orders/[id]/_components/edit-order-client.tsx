"use client";

import { useRouter } from "next/navigation";
import { OrderForm, type OrderFormValues } from "../../_components/order-form";
import { updateOrderAction, updateOrderAndNotifyAction } from "../../actions";

interface EditOrderClientProps {
  orderId: string;
  initialValues: OrderFormValues;
  customers: { id: string; name: string; phone: string; email: string | null }[];
  header: React.ReactNode;
  headerActions?: React.ReactNode;
  sidebarTop?: React.ReactNode;
  inventoryTab?: React.ReactNode;
  expensesTab?: React.ReactNode;
  staffingTab?: React.ReactNode;
  pricingExtra?: React.ReactNode;
  billingPanel?: React.ReactNode;
  sidebarInvoiceAction?: React.ReactNode;
  menuPlanBanner?: React.ReactNode;
  /** True while the menu is with the customer or the kitchen (see menu-status-banner.tsx's phases). */
  menuPlanReadOnly: boolean;
  menuPlanInApprovalTab: boolean;
  menuApprovalTab: React.ReactNode;
  initialTab?: string;
  priceFrozen: boolean;
  /** Sent to the kitchen (or completed): the order is final, so the form is read-only (payments still work). */
  locked: boolean;
  /** Completed: even the inventory, expenses and staffing tabs are read-only. */
  completed: boolean;
  eventTypes: { id: string; name: string }[];
  menus: {
    id: string;
    name: string;
    menuType: "VEGETARIAN" | "NON_VEGETARIAN";
    price: number;
    childUnder5Chargeable: boolean;
    childUnder5Price: number | null;
    child5To10PricingType: "PERCENTAGE" | "FIXED";
    child5To10PriceValue: number | null;
  }[];
  /** See OrderForm's own doc comment — non-zero only for an Order converted from a Quotation. */
  carriedOverItemsSubtotal?: number;
}

export function EditOrderClient({
  orderId,
  initialValues,
  customers,
  eventTypes,
  menus,
  carriedOverItemsSubtotal,
  header,
  headerActions,
  sidebarTop,
  inventoryTab,
  expensesTab,
  staffingTab,
  pricingExtra,
  billingPanel,
  sidebarInvoiceAction,
  menuPlanBanner,
  menuPlanReadOnly,
  menuPlanInApprovalTab,
  menuApprovalTab,
  initialTab,
  priceFrozen,
  locked,
  completed,
}: EditOrderClientProps) {
  const router = useRouter();

  return (
    <OrderForm
      header={header}
      headerActions={headerActions}
      sidebarTop={sidebarTop}
      inventoryTab={inventoryTab}
      expensesTab={expensesTab}
      staffingTab={staffingTab}
      pricingExtra={pricingExtra}
      billingPanel={billingPanel}
      sidebarInvoiceAction={sidebarInvoiceAction}
      menuPlanReadOnly={menuPlanReadOnly}
      menuPlanOnlyIfChanged
      menuPlanInApprovalTab={menuPlanInApprovalTab}
      menuApprovalTab={menuApprovalTab}
      initialTab={initialTab}
      priceFrozen={priceFrozen}
      locked={locked}
      completed={completed}
      menuPlanBanner={menuPlanBanner}
      customers={customers}
      eventTypes={eventTypes}
      menus={menus}
      carriedOverItemsSubtotal={carriedOverItemsSubtotal}
      initialValues={initialValues}
      submitLabel="Save changes"
      onSubmit={(formData) => updateOrderAction(orderId, formData)}
      onSubmitAndNotify={(formData) => updateOrderAndNotifyAction(orderId, formData)}
      cancelHref="/orders"
      onSuccess={() => router.refresh()}
    />
  );
}
