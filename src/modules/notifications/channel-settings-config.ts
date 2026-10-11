// Client-safe (no server imports): what each notification channel offers on its
// Settings page (AJ's reference layouts, 2026-09-30). The messages and
// templates are the catalogue; what a caterer switched on lives in TenantSetting
// (see channel-settings.ts).

export type SettingsChannel = "whatsapp" | "email" | "push";

export type MessageKey =
  | "orderConfirmation"
  | "orderStatusUpdates"
  | "paymentConfirmation"
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
  | "foodDispatched";

export interface ChannelMessageDef {
  key: MessageKey;
  label: string;
  description: string;
  /** False = shown greyed with "(Coming Soon)" and can't be switched on yet. */
  available: boolean;
}

export interface ChannelTemplateDef {
  key: string;
  title: string;
  tone: "success" | "info";
  defaultBody: string;
}

export const TEMPLATE_VARIABLES = ["{{customer_name}}", "{{order_number}}", "{{event_date}}", "{{event_address}}"] as const;

interface ChannelConfig {
  label: string;
  /** Whether the channel has a provider the platform connects (and the caterer activates); push has none. */
  hasService: boolean;
  messages: ChannelMessageDef[];
  templates: ChannelTemplateDef[];
}

const ORDER_CONFIRMATION_TEMPLATE: ChannelTemplateDef = {
  key: "orderConfirmationCustomer",
  title: "Order Confirmation (Customer)",
  tone: "success",
  defaultBody: "Dear {{customer_name}},\nwe have received your order {{order_number}} for event on {{event_date}} at {{event_address}}.\nThank you for choosing us!",
};

const NEW_ORDER_ALERT_TEMPLATE: ChannelTemplateDef = {
  key: "newOrderAlertVendor",
  title: "New Order Alert (Vendor)",
  tone: "info",
  defaultBody: "New Order Alert!\nOrder {{order_number}} from {{customer_name}} for event on {{event_date}} at {{event_address}}.\nLogin to Platterly to review.",
};

export const CHANNEL_CONFIG: Record<SettingsChannel, ChannelConfig> = {
  whatsapp: {
    label: "WhatsApp",
    hasService: true,
    messages: [
      { key: "orderConfirmation", label: "Order Confirmation", description: "Send a WhatsApp message when new orders are created", available: true },
      { key: "orderStatusUpdates", label: "Order Status Updates", description: "Send a WhatsApp message when order status changes", available: false },
      { key: "paymentConfirmation", label: "Payment Confirmation", description: "Send a WhatsApp message when payments are received", available: true },
      { key: "eventReminders", label: "Event Reminders", description: "Send WhatsApp reminders for upcoming events", available: false },
      { key: "systemAlerts", label: "System Alerts", description: "Send important system notifications", available: false },
    ],
    templates: [ORDER_CONFIRMATION_TEMPLATE, NEW_ORDER_ALERT_TEMPLATE],
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
    templates: [ORDER_CONFIRMATION_TEMPLATE],
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
    templates: [],
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

export interface ChannelSettings {
  /** Set by the Platterly team from the admin dashboard, never by the caterer. */
  providerConnected: boolean;
  /** The caterer's activate / deactivate switch; only ever true while a provider is connected. */
  active: boolean;
  messages: Partial<Record<MessageKey, boolean>>;
  templates: Record<string, string>;
}
