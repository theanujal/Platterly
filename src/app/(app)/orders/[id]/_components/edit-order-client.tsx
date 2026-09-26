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
  beforeContent?: React.ReactNode;
  afterContent?: React.ReactNode;
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

export function EditOrderClient({ orderId, initialValues, customers, eventTypes, menus, carriedOverItemsSubtotal, header, headerActions, beforeContent, afterContent }: EditOrderClientProps) {
  const router = useRouter();

  return (
    <OrderForm
      header={header}
      headerActions={headerActions}
      beforeContent={beforeContent}
      afterContent={afterContent}
      customers={customers}
      eventTypes={eventTypes}
      menus={menus}
      carriedOverItemsSubtotal={carriedOverItemsSubtotal}
      initialValues={initialValues}
      showStatus
      submitLabel="Save changes"
      onSubmit={(formData) => updateOrderAction(orderId, formData)}
      onSubmitAndNotify={(formData) => updateOrderAndNotifyAction(orderId, formData)}
      cancelHref="/orders"
      onSuccess={() => router.refresh()}
    />
  );
}
