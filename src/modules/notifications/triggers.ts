import "server-only";
import { prisma } from "@/lib/db";
import type { OrderStatus } from "@/generated/prisma/enums";
import { notify } from "@/lib/notifications/notify";
import { formatInr } from "@/lib/format-currency";
import { orderBalance } from "@/modules/payments/payment";

/**
 * Chunk 16: who gets told what, and when. Every business event that sends a message calls ONE function here, so the
 * customer / kitchen-team split, the roles and the wording of in-app alerts live in a single file. The channel
 * switches (connected, active, per-message) are enforced inside `notify()`, not here.
 *
 * A notification must never break the action that caused it, so each trigger swallows and logs its own errors.
 */

/** Roles per audience (role ids from `lib/auth/permissions.ts`). */
const SALES_ROLES = ["owner", "manager", "salesEvents"];
const KITCHEN_ROLES = ["owner", "kitchen"];
const ACCOUNTS_ROLES = ["owner", "accounts"];

const DATE_FORMAT = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const formatDate = (d: Date | null | undefined) => (d ? DATE_FORMAT.format(d) : undefined);

async function safely(label: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (error) {
    console.error(`[notifications] ${label} failed:`, error);
  }
}

// --- building blocks --------------------------------------------------------------------------------------

export interface OrderContext {
  kitchenName: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string;
  orderNumber?: string;
  eventDate?: string;
  eventAddress?: string;
  eventType?: string;
  amount: number;
  balance: number;
  orderId: string;
}

export async function loadOrderContext(organizationId: string, orderId: string): Promise<OrderContext> {
  const [order, org, money] = await Promise.all([
    prisma.order.findFirstOrThrow({
      where: { id: orderId, organizationId },
      select: { orderNumber: true, eventStartDate: true, eventAddress: true, venue: true, eventType: { select: { name: true } }, customer: { select: { name: true, email: true, phone: true } } },
    }),
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } }),
    orderBalance(organizationId, orderId),
  ]);
  return {
    kitchenName: org.name,
    customerName: order.customer.name,
    customerEmail: order.customer.email,
    customerPhone: order.customer.phone,
    orderNumber: order.orderNumber ?? undefined,
    eventDate: formatDate(order.eventStartDate),
    eventAddress: order.eventAddress ?? order.venue ?? undefined,
    eventType: order.eventType?.name,
    amount: money.total,
    balance: money.balance,
    orderId,
  };
}

/** The fields every customer/kitchen email template reads (see `EmailData`). */
export function emailPayload(c: OrderContext, extra: Record<string, unknown> = {}) {
  return {
    orderId: c.orderId,
    kitchenName: c.kitchenName,
    customerName: c.customerName,
    orderNumber: c.orderNumber,
    eventDate: c.eventDate,
    eventAddress: c.eventAddress,
    eventType: c.eventType,
    amount: c.amount,
    balance: c.balance,
    ...extra,
  };
}

/** Active team members holding any of these roles. */
export async function teamMembers(organizationId: string, roles: string[]) {
  const members = await prisma.member.findMany({
    where: { organizationId, role: { in: roles }, disabledAt: null },
    select: { user: { select: { id: true, email: true } } },
  });
  const seen = new Set<string>();
  return members.map((m) => m.user).filter((u) => (seen.has(u.id) ? false : (seen.add(u.id), true)));
}

type Payload = Record<string, string | number | boolean | null | undefined>;

/** Email + WhatsApp to a customer (each only if they have the contact detail). */
export async function notifyCustomer(params: { organizationId: string; event: string; email?: string | null; phone?: string | null; payload: Payload }) {
  const payload = JSON.parse(JSON.stringify(params.payload));
  if (params.email) await notify({ organizationId: params.organizationId, channel: "EMAIL", event: params.event, recipient: { email: params.email }, payload });
  if (params.phone) await notify({ organizationId: params.organizationId, channel: "WHATSAPP", event: params.event, recipient: { phone: params.phone }, payload });
}

/** In-app (one row per person, so the bell can show each their own) and optionally email, to the team by role. */
export async function notifyTeam(params: { organizationId: string; roles: string[]; event: string; title: string; message: string; email?: boolean; push?: boolean; payload: Payload }) {
  const payload = JSON.parse(JSON.stringify({ ...params.payload, title: params.title, message: params.message }));
  for (const user of await teamMembers(params.organizationId, params.roles)) {
    await notify({ organizationId: params.organizationId, channel: "IN_APP", event: params.event, recipient: { userId: user.id }, payload });
    if (params.push !== false) await notify({ organizationId: params.organizationId, channel: "PUSH", event: params.event, recipient: { userId: user.id }, payload });
    if (params.email) await notify({ organizationId: params.organizationId, channel: "EMAIL", event: params.event, recipient: { email: user.email, userId: user.id }, payload });
  }
}

/** Platform alert for every Super Admin (bell + push). It is stored under the caterer it is about. */
export async function notifySuperAdmins(params: { organizationId: string; event: string; title: string; message: string; href: string }) {
  const payload = { title: params.title, message: params.message, href: params.href };
  const admins = await prisma.user.findMany({ where: { isSuperAdmin: true }, select: { id: true } });
  for (const admin of admins) {
    await notify({ organizationId: params.organizationId, channel: "IN_APP", event: params.event, recipient: { userId: admin.id }, payload });
    await notify({ organizationId: params.organizationId, channel: "PUSH", event: params.event, recipient: { userId: admin.id }, payload });
  }
}

/** A new caterer signed up on their own. */
export function onCatererSignedUp(organizationId: string, ownerName: string) {
  return safely("onCatererSignedUp", () =>
    notifySuperAdmins({ organizationId, event: "caterer.signed_up", title: "New caterer signed up", message: `${ownerName || "A new caterer"} just created an account.`, href: `/super/tenants/${organizationId}` }),
  );
}

const orderLabel = (c: OrderContext) => (c.orderNumber ? `Order ${c.orderNumber}` : "An order");

// --- triggers ---------------------------------------------------------------------------------------------

/** A new order exists (storefront submit, admin-created, converted quotation). */
export function onOrderCreated(organizationId: string, orderId: string) {
  return safely("onOrderCreated", async () => {
    const c = await loadOrderContext(organizationId, orderId);
    await notifyCustomer({ organizationId, event: "order.created", email: c.customerEmail, phone: c.customerPhone, payload: emailPayload(c) });
    await notifyTeam({
      organizationId,
      roles: SALES_ROLES,
      event: "order.new_alert",
      email: true,
      title: "New order",
      message: `${orderLabel(c)} from ${c.customerName}${c.eventDate ? ` for ${c.eventDate}` : ""}.`,
      payload: emailPayload(c),
    });
  });
}

const CUSTOMER_STATUS_UPDATES = new Set(["APPROVED", "SENT_TO_KITCHEN", "COMPLETED", "CANCELLED"]);

/** The order's status changed (automatic follow-the-menu or set by hand). */
export function onOrderStatusChanged(organizationId: string, orderId: string, status: string, note?: string | null) {
  return safely("onOrderStatusChanged", async () => {
    if (!CUSTOMER_STATUS_UPDATES.has(status)) return;
    const c = await loadOrderContext(organizationId, orderId);
    await notifyCustomer({ organizationId, event: "order.status_changed", email: c.customerEmail, phone: c.customerPhone, payload: emailPayload(c, { status, note: note ?? undefined }) });
    if (status === "SENT_TO_KITCHEN") {
      await notifyTeam({
        organizationId,
        roles: KITCHEN_ROLES,
        event: "order.sent_to_kitchen",
        title: "Order sent to kitchen",
        message: `${orderLabel(c)} for ${c.customerName}${c.eventDate ? ` (${c.eventDate})` : ""} is ready for preparation.`,
        payload: emailPayload(c),
      });
    }
  });
}

/** The customer opened their approval link and acted (approved, asked for changes, sent venue details...). */
export function onCustomerMenuAction(organizationId: string, orderId: string | null, kind: "approved" | "changes_requested" | "change_asked_after_approval" | "venue_details_submitted", extra: Payload = {}) {
  const text = {
    approved: ["Menu approved", "approved the menu"],
    changes_requested: ["Changes requested", "asked for changes to the menu"],
    change_asked_after_approval: ["Change asked after approval", "asked for a change after approving"],
    venue_details_submitted: ["Venue details received", "sent the venue and delivery details"],
  }[kind];
  return safely("onCustomerMenuAction", async () => {
    if (!orderId) return;
    const c = await loadOrderContext(organizationId, orderId);
    await notifyTeam({
      organizationId,
      roles: SALES_ROLES,
      event: `menu_approval.${kind}`,
      title: text[0],
      message: `${c.customerName} ${text[1]}${c.orderNumber ? ` (${c.orderNumber})` : ""}.`,
      payload: emailPayload(c, extra),
    });
  });
}

/** The customer accepted / rejected / asked changes on a quotation. */
export function onQuotationResponded(organizationId: string, quotationId: string, status: "ACCEPTED" | "REJECTED" | "CHANGES_REQUESTED") {
  const verb = { ACCEPTED: "accepted", REJECTED: "rejected", CHANGES_REQUESTED: "asked for changes to" }[status];
  return safely("onQuotationResponded", async () => {
    const q = await prisma.quotation.findFirstOrThrow({ where: { id: quotationId, organizationId }, select: { customer: { select: { name: true } } } });
    await notifyTeam({
      organizationId,
      roles: SALES_ROLES,
      event: `quotation.${status.toLowerCase()}`,
      title: `Quotation ${status === "CHANGES_REQUESTED" ? "changes requested" : verb}`,
      message: `${q.customer.name} ${verb} their quotation.`,
      payload: { quotationId },
    });
  });
}

/** A payment landed (Razorpay confirmed) or a UPI claim is waiting for the team. */
export function onPaymentActivity(organizationId: string, orderId: string, amount: number, kind: "received" | "upi_claimed") {
  return safely("onPaymentActivity", async () => {
    const c = await loadOrderContext(organizationId, orderId);
    await notifyTeam({
      organizationId,
      roles: ACCOUNTS_ROLES,
      event: kind === "received" ? "payment.received" : "payment.upi_claimed",
      email: true,
      title: kind === "received" ? "Payment received" : "UPI payment to confirm",
      message: `${c.customerName} ${kind === "received" ? "paid" : "says they paid"} ${formatInr(amount)}${c.orderNumber ? ` for ${c.orderNumber}` : ""}.`,
      payload: emailPayload(c, { amount }),
    });
  });
}

// --- scheduled: reminders and payment dues ---------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Midnight (UTC) of the India calendar day `offsetDays` from `now`, matching how event dates are stored. */
function istDay(now: Date, offsetDays: number): Date {
  const shifted = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) + offsetDays * DAY_MS);
}

async function alreadySent(organizationId: string, event: string, dedupeKey: string): Promise<boolean> {
  const found = await prisma.notification.findFirst({ where: { organizationId, event, payload: { path: ["dedupeKey"], equals: dedupeKey } }, select: { id: true } });
  return found !== null;
}

const OPEN_STATUSES: readonly OrderStatus[] = ["PENDING_REVIEW", "AWAITING_CUSTOMER_APPROVAL", "APPROVED", "SENT_TO_KITCHEN"];
/** Money is still owed on a finished order too, so payment reminders cover everything except cancelled. */
const BILLABLE_STATUSES: readonly OrderStatus[] = [...OPEN_STATUSES, "COMPLETED"];

export interface DueRunResult {
  eventReminders: number;
  paymentDue: number;
  paymentOverdue: number;
}

/**
 * Called by the cron endpoint every few minutes. Each message is sent once: it carries a `dedupeKey`
 * (order + kind) and a run skips any order that already has a notification with it.
 *   event reminder: 2 days and 1 day before the event (customer by email/WhatsApp, kitchen in-app)
 *   payment due:    3 days before the event while a balance is open
 *   payment overdue: the day after the event while a balance is open
 */
export async function runDueNotifications(now: Date = new Date()): Promise<DueRunResult> {
  const result: DueRunResult = { eventReminders: 0, paymentDue: 0, paymentOverdue: 0 };

  const eventsOn = (offset: number, statuses: readonly OrderStatus[] = OPEN_STATUSES) =>
    prisma.order.findMany({
      where: { status: { in: [...statuses] }, eventStartDate: { gte: istDay(now, offset), lt: istDay(now, offset + 1) } },
      select: { id: true, organizationId: true },
    });

  for (const daysBefore of [2, 1]) {
    for (const { id, organizationId } of await eventsOn(daysBefore)) {
      const key = `${id}:reminder:${daysBefore}`;
      if (await alreadySent(organizationId, "event.reminder", key)) continue;
      await safely("event reminder", async () => {
        const c = await loadOrderContext(organizationId, id);
        const payload = emailPayload(c, { daysBefore, dedupeKey: key });
        await notifyCustomer({ organizationId, event: "event.reminder", email: c.customerEmail, phone: c.customerPhone, payload });
        if (daysBefore === 1) {
          await notifyTeam({
            organizationId,
            roles: KITCHEN_ROLES,
            event: "event.reminder",
            title: "Event tomorrow",
            message: `${orderLabel(c)} for ${c.customerName} is tomorrow${c.eventAddress ? ` at ${c.eventAddress}` : ""}.`,
            payload,
          });
        }
        result.eventReminders += 1;
      });
    }
  }

  for (const { id, organizationId } of await eventsOn(3, BILLABLE_STATUSES)) {
    const key = `${id}:due`;
    if (await alreadySent(organizationId, "payment.due", key)) continue;
    await safely("payment due", async () => {
      const c = await loadOrderContext(organizationId, id);
      if (c.balance <= 0) return;
      await notifyCustomer({ organizationId, event: "payment.due", email: c.customerEmail, phone: c.customerPhone, payload: emailPayload(c, { dedupeKey: key }) });
      result.paymentDue += 1;
    });
  }

  for (const { id, organizationId } of await eventsOn(-1, BILLABLE_STATUSES)) {
    const key = `${id}:overdue`;
    if (await alreadySent(organizationId, "payment.overdue", key)) continue;
    await safely("payment overdue", async () => {
      const c = await loadOrderContext(organizationId, id);
      if (c.balance <= 0) return;
      await notifyCustomer({ organizationId, event: "payment.overdue", email: c.customerEmail, phone: c.customerPhone, payload: emailPayload(c, { dedupeKey: key }) });
      result.paymentOverdue += 1;
    });
  }

  return result;
}
