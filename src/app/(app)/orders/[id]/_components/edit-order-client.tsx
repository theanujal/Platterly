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
  statusCard?: React.ReactNode;
  detailsExtra?: React.ReactNode;
  inventoryTab?: React.ReactNode;
  expensesTab?: React.ReactNode;
  staffingTab?: React.ReactNode;
  pricingExtra?: React.ReactNode;
  billingPanel?: React.ReactNode;
  sidebarInvoiceAction?: React.ReactNode;
  /** True while the menu is with the customer or the kitchen (see menu-status-banner.tsx's phases). */
  menuApprovalTab: React.ReactNode;
  initialTab?: string;
  priceFrozen: boolean;
  /** The menu is in front of the customer right now: customer and event details are read-only too. */
  withCustomer: boolean;
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
  /** The viewer may see prices (Sensitive data: orderPrices). See OrderForm. */
  showPrices: boolean;
}

export function EditOrderClient({
  orderId,
  initialValues,
  customers,
  eventTypes,
  menus,
  carriedOverItemsSubtotal,
  showPrices,
  header,
  headerActions,
  sidebarTop,
  statusCard,
  detailsExtra,
  inventoryTab,
  expensesTab,
  staffingTab,
  pricingExtra,
  billingPanel,
  sidebarInvoiceAction,
  menuApprovalTab,
  initialTab,
  priceFrozen,
  withCustomer,
  locked,
  completed,
}: EditOrderClientProps) {
  const router = useRouter();

  return (
    <OrderForm
      header={header}
      headerActions={headerActions}
      sidebarTop={sidebarTop}
      statusCard={statusCard}
      detailsExtra={detailsExtra}
      inventoryTab={inventoryTab}
      expensesTab={expensesTab}
      staffingTab={staffingTab}
      pricingExtra={pricingExtra}
      billingPanel={billingPanel}
      sidebarInvoiceAction={sidebarInvoiceAction}
      menuPlanOnlyIfChanged
      menuApprovalTab={menuApprovalTab}
      initialTab={initialTab}
      priceFrozen={priceFrozen}
      withCustomer={withCustomer}
      locked={locked}
      completed={completed}
      customers={customers}
      eventTypes={eventTypes}
      menus={menus}
      carriedOverItemsSubtotal={carriedOverItemsSubtotal}
      showPrices={showPrices}
      initialValues={initialValues}
      submitLabel="Save changes"
      onSubmit={(formData) => updateOrderAction(orderId, formData)}
      onSubmitAndNotify={(formData) => updateOrderAndNotifyAction(orderId, formData)}
      cancelHref="/orders"
      onSuccess={() => router.refresh()}
    />
  );
}
