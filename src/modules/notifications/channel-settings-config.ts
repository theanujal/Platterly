// Client-safe (no server imports): what each notification channel offers on its
// Settings page (AJ's reference layouts, 2026-09-30). The messages and
// per-message switches are the catalogue; what a caterer switched on lives in TenantSetting
// (see channel-settings.ts).

export type SettingsChannel = "whatsapp" | "email" | "push";

export type MessageKey =
  | "orderConfirmation"
  | "orderStatusUpdates"
  | "eventReminders"
  | "systemAlerts"
  // Kitchen -> customer emails (Settings -> Email): one switch each, all on until the kitchen turns one off.
  | "orderReceived"
  | "orderConfirmed"
  | "orderUpdate"
  | "orderCompleted"
  | "quotation"
  | "menuReview"
  | "invoice"
  | "receipt"
  | "paymentLink"
  | "paymentReminder"
  | "eventReminder"
  | "foodDispatched"
  // Platterly -> kitchen WhatsApp (Settings -> WhatsApp): the seven messages in lib/notifications/whatsapp/templates.ts.
  | "waNewOrder"
  | "waSentToKitchen"
  | "waMenuSent"
  | "waMenuApproved"
  | "waPaymentReceived"
  | "waEventsTomorrow"
  | "waOverdueDigest";

export interface ChannelMessageDef {
  key: MessageKey;
  label: string;
  description: string;
  /** False = shown greyed with "(Coming Soon)" and can't be switched on yet. */
  available: boolean;
}

interface ChannelConfig {
  label: string;
  /** Whether the channel has a provider the platform connects (and the caterer activates); push has none. */
  hasService: boolean;
  messages: ChannelMessageDef[];
}

export const CHANNEL_CONFIG: Record<SettingsChannel, ChannelConfig> = {
  whatsapp: {
    label: "WhatsApp",
    hasService: true,
    // WhatsApp goes only to the kitchen's own team (the owner's phone), never to customers (AJ, 2026-10-09).
    messages: [
      { key: "waNewOrder", label: "New Order", description: "Tell the kitchen when a new order arrives", available: true },
      { key: "waSentToKitchen", label: "Order Sent to Kitchen", description: "Tell the kitchen when an order is sent to it, so the stock can be checked", available: true },
      { key: "waMenuSent", label: "Menu Sent for Approval", description: "Tell the kitchen when a menu has gone to the customer for approval", available: true },
      { key: "waMenuApproved", label: "Menu Approved", description: "Tell the kitchen when a customer approves their menu", available: true },
      { key: "waPaymentReceived", label: "Payment Received", description: "Tell the kitchen when a customer pays", available: true },
      { key: "waEventsTomorrow", label: "Events Tomorrow", description: "A daily summary of the events to cater tomorrow, from 8 am", available: true },
      { key: "waOverdueDigest", label: "Overdue Payments", description: "A weekly (Monday) reminder of orders with overdue payments", available: true },
    ],
  },
  email: {
    label: "Email",
    hasService: true,
    messages: [
      { key: "orderReceived", label: "Order Received", description: "Tell the customer their order request has reached you", available: true },
      { key: "orderConfirmed", label: "Order Confirmed", description: "Tell the customer their order is confirmed", available: true },
      { key: "orderUpdate", label: "Order Update", description: "Update on the order request, for example when it is sent to the kitchen or cancelled", available: true },
      { key: "orderCompleted", label: "Order Completed", description: "Tell the customer their order has been completed", available: true },
      { key: "quotation", label: "Quotation", description: "Send the quotation to the customer", available: true },
      { key: "menuReview", label: "Menu & Order Review", description: "Send the menu approval link to the customer", available: true },
      { key: "foodDispatched", label: "Food Dispatched", description: "Tell the customer the food is on the way", available: true },
      { key: "invoice", label: "Invoice", description: "Send the invoice to the customer", available: true },
      { key: "receipt", label: "Payment Receipt", description: "Send the receipt when a payment is confirmed", available: true },
      { key: "paymentLink", label: "Payment Link", description: "Send a payment link to the customer", available: true },
      { key: "paymentReminder", label: "Payment Reminder", description: "Remind the customer before and after the event while a balance is open", available: true },
      { key: "eventReminder", label: "Event Reminder", description: "Remind the customer 2 days and 1 day before the event", available: true },
    ],
  },
  push: {
    label: "Push",
    hasService: false,
    messages: [
      { key: "orderConfirmation", label: "Order Confirmation", description: "Receive a push notification when new orders are created", available: true },
      { key: "orderStatusUpdates", label: "Order Status Updates", description: "Receive a push notification when order status changes", available: false },
      { key: "eventReminders", label: "Event Reminders", description: "Receive a push notification for upcoming events", available: true },
      { key: "systemAlerts", label: "System Alerts", description: "Receive important system notifications", available: false },
    ],
  },
};

/**
 * Which Settings -> Email switch governs a kitchen -> customer email. Anything not listed (the team's own alerts, invitations,
 * security codes) is always sent and ignores the kitchen's switches.
 */
export function emailMessageFor(event: string, payload?: unknown): MessageKey | null {
  switch (event) {
    case "order.created":
    case "order.create_and_notify":
      return "orderReceived";
    case "order.status_changed": {
      const status = (payload as { status?: unknown } | null | undefined)?.status;
      return status === "APPROVED" ? "orderConfirmed" : status === "COMPLETED" ? "orderCompleted" : "orderUpdate";
    }
    case "quotation.sent":
      return "quotation";
    case "menu_approval.sent":
      return "menuReview";
    case "logistics.dispatched_customer":
      return "foodDispatched";
    case "invoice.sent":
      return "invoice";
    case "receipt.sent":
      return "receipt";
    case "payment.link_sent":
      return "paymentLink";
    case "payment.due":
    case "payment.overdue":
      return "paymentReminder";
    case "event.reminder":
      return "eventReminder";
    default:
      return null;
  }
}

/** Which Settings -> WhatsApp switch governs a kitchen WhatsApp message; null for an event WhatsApp never sends. */
export function whatsappMessageFor(event: string): MessageKey | null {
  switch (event) {
    case "order.new_alert":
      return "waNewOrder";
    case "order.sent_to_kitchen":
      return "waSentToKitchen";
    case "menu_approval.sent":
      return "waMenuSent";
    case "menu_approval.approved":
      return "waMenuApproved";
    case "payment.received":
      return "waPaymentReceived";
    case "event.tomorrow_summary":
      return "waEventsTomorrow";
    case "payment.overdue_digest":
      return "waOverdueDigest";
    default:
      return null;
  }
}

export interface ChannelSettings {
  /** Set by the Platterly team from the admin dashboard, never by the caterer. */
  providerConnected: boolean;
  /** The caterer's activate / deactivate switch; only ever true while a provider is connected. */
  active: boolean;
  messages: Partial<Record<MessageKey, boolean>>;
}
