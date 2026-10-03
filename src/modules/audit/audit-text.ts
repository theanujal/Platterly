/**
 * Chunk 17.2 — turning an audit row into words a person can read. Pure functions (no database), so they are tested
 * directly and shared by the page and the tests.
 */

const ACTIONS: Record<string, string> = {
  "tenant.create": "Kitchen account created",
  "tenant.update": "Business profile updated",
  "tenant.onboarding_complete": "Set-up wizard finished",
  "tenant.slug_self_service": "Public link changed",
  "tenant.slug_override": "Public link changed by Platterly",
  "tenant.suspend": "Account suspended by Platterly",
  "tenant.activate": "Account reactivated by Platterly",
  "tenant.deactivate": "Account deactivated by Platterly",
  "tenant.data_purge": "All data deleted (Danger Zone)",
  "subscription.assign_plan": "Plan assigned",
  "order.create": "Order created",
  "order.update": "Order updated",
  "order.delete": "Order deleted",
  "order.status_synced": "Order status followed the menu approval",
  "order.status_changed_manually": "Order status set by hand",
  "order.event_created": "Event created for the order",
  "order.whatsapp_sent": "Order sent on WhatsApp",
  "order.venue_details_submitted_via_link": "Customer sent venue and delivery details",
  "customer.create": "Customer added",
  "customer.update": "Customer updated",
  "customer.delete": "Customer deleted",
  "customer.merge_duplicate": "Duplicate customer merged",
  "customer.marketing_opt_out": "Customer unsubscribed from promotions",
  "customer.marketing_opt_in": "Customer subscribed to promotions again",
  "quotation.create": "Quotation created",
  "quotation.update": "Quotation updated",
  "quotation.delete": "Quotation deleted",
  "quotation.send": "Quotation sent to the customer",
  "quotation.accept": "Customer accepted the quotation",
  "quotation.reject": "Customer rejected the quotation",
  "quotation.request_changes": "Customer asked for changes to the quotation",
  "quotation.convert_to_order": "Quotation converted to an order",
  "menu_selection.sent_to_customer": "Menu sent to the customer",
  "menu_selection.version_sent": "Menu version sent to the customer",
  "menu_selection.customer_approved": "Customer approved the menu",
  "menu_selection.customer_approved_via_link": "Customer approved the menu (link)",
  "menu_selection.customer_changes_requested_via_link": "Customer asked for menu changes (link)",
  "menu_selection.recalled": "Menu recalled for editing",
  "menu_selection.status_changed_manually": "Menu approval status set by hand",
  "menu_selection.kitchen_production_status_change": "Kitchen status changed",
  "menu_selection.kitchen_production_status_advance": "Kitchen status moved on",
  "payments.method_toggled": "Payment method switched on or off",
  "payment.razorpay_confirmed": "Razorpay payment confirmed",
  "expense.create": "Expense recorded",
  "expense.update": "Expense updated",
  "expense.delete": "Expense deleted",
  "recurring_expense.create": "Repeating expense set up",
  "recurring_expense.generate": "Repeating expense booked",
  "recurring_expense.delete": "Repeating expense stopped",
  "invoice.sent": "Invoice sent",
  "notifications.whatsapp_provider_connected": "WhatsApp connected by Platterly",
  "notifications.whatsapp_provider_disconnected": "WhatsApp switched off by Platterly",
  "notifications.email_provider_connected": "Email connected by Platterly",
  "notifications.email_provider_disconnected": "Email switched off by Platterly",
};

const ENTITY: Record<string, string> = {
  tenant: "Kitchen",
  menu_selection: "Menu approval",
  menu_item: "Food item",
  menu_category: "Menu category",
  menu: "Menu",
  event: "Event",
  event_type: "Event type",
  add_on: "Add-on",
  recurring_expense: "Repeating expense",
  inventory: "Inventory item",
  order: "Order",
  customer: "Customer",
  quotation: "Quotation",
  invoice: "Invoice",
  payment: "Payment",
  expense: "Expense",
  subscription: "Subscription",
};

const sentence = (text: string) => {
  const t = text.replace(/[_.]+/g, " ").trim().toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** "Order created", or for an action not listed, a readable guess such as "Menu item: update". */
export function describeAction(action: string): string {
  if (ACTIONS[action]) return ACTIONS[action];
  const [entity, ...rest] = action.split(".");
  if (rest.length === 0) return sentence(action);
  const name = ENTITY[entity] ?? sentence(entity);
  return `${name}: ${rest.join(" ").replace(/_/g, " ")}`;
}

/** Who did it: the person, or "Customer" for a no-login link, or "System" for a scheduled job or automatic step. */
export function describeActor(actorName: string | null | undefined, action: string): string {
  if (actorName) return actorName;
  if (/via_link|customer_|intake|\.accept$|\.reject$|\.request_changes$|opt_out|opt_in/.test(action)) return "Customer";
  return "System";
}

const SENSITIVE = /secret|password|token|passcode|webhook|api[_-]?key|authorization|credential|otp/i;
const NOISE = new Set(["id", "createdAt", "updatedAt", "organizationId", "created_at", "updated_at"]);

export interface AuditChange {
  field: string;
  before: string;
  after: string;
}

const MAX_VALUE = 160;

function show(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value.length > MAX_VALUE ? `${value.slice(0, MAX_VALUE)}…` : value || "—";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const json = JSON.stringify(value);
  return json.length > MAX_VALUE ? `${json.slice(0, MAX_VALUE)}…` : json;
}

const label = (field: string) => field.replace(/([A-Z])/g, " $1").replace(/[_.]+/g, " ").replace(/^./, (c) => c.toUpperCase());

/**
 * What changed between two snapshots. Fields named like a secret are never shown (their value is replaced), noisy
 * bookkeeping fields (ids, timestamps) are skipped, and a create (no "before") lists the fields it was created with.
 */
export function diffAudit(before: unknown, after: unknown, limit = 14): AuditChange[] {
  const b = before && typeof before === "object" && !Array.isArray(before) ? (before as Record<string, unknown>) : null;
  const a = after && typeof after === "object" && !Array.isArray(after) ? (after as Record<string, unknown>) : null;
  if (!b && !a) return [];
  const keys = [...new Set([...Object.keys(b ?? {}), ...Object.keys(a ?? {})])].filter((k) => !NOISE.has(k));
  const changes: AuditChange[] = [];
  for (const key of keys) {
    const from = b?.[key];
    const to = a?.[key];
    const same = JSON.stringify(from) === JSON.stringify(to);
    if (b && a && same) continue;
    if (!b && (to === null || to === undefined || to === "")) continue; // a create: only list what was filled in
    const hidden = SENSITIVE.test(key);
    changes.push({ field: label(key), before: hidden && from !== undefined ? "••••" : show(from), after: hidden && to !== undefined ? "••••" : show(to) });
    if (changes.length >= limit) break;
  }
  return changes;
}

/** Where the record can be opened in the app, when it can. */
export function recordHref(recordType: string, recordId: string): string | null {
  switch (recordType) {
    case "Order":
      return `/orders/${recordId}`;
    case "Customer":
      return `/customers/${recordId}`;
    case "Quotation":
      return `/quotations/${recordId}`;
    case "Invoice":
      return `/invoices/${recordId}`;
    default:
      return null;
  }
}
