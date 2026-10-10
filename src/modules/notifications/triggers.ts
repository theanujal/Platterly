import "server-only";
import { prisma } from "@/lib/db";
import type { OrderStatus } from "@/generated/prisma/enums";
import { notify } from "@/lib/notifications/notify";
import { formatInr } from "@/lib/format-currency";
import { orderBalance } from "@/modules/payments/payment";
import { canonicalUrl } from "@/lib/seo/canonical";
import { unsubscribeUrl } from "@/lib/notifications/unsubscribe";
import { canSendPromotions, isPromotionalEvent } from "./opt-out";
import { opsBillingOn } from "@/modules/ops-link/config";
import { normalizePhone } from "@/lib/phone";

/**
 * Chunk 16: who gets told what, and when. Every business event that sends a message calls ONE function here, so the
 * customer / kitchen-team split, the roles and the wording of in-app alerts live in a single file. The channel
 * switches (connected, active, per-message) are enforced inside `notify()`, not here.
 *
 * A notification must never break the action that caused it, so each trigger swallows and logs its own errors.
 */

/**
 * Every team alert goes to every active team member, whatever their role (AJ, 2026-10-04). `roles` stays an optional
 * filter on `notifyTeam` / `teamMembers` in case a message ever needs to be narrowed again.
 */

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
  customerId: string;
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
      select: { orderNumber: true, eventStartDate: true, eventAddress: true, venue: true, eventType: { select: { name: true } }, customer: { select: { id: true, name: true, email: true, phone: true } } },
    }),
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } }),
    orderBalance(organizationId, orderId),
  ]);
  return {
    kitchenName: org.name,
    customerId: order.customer.id,
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
    unsubscribeUrl: unsubscribeUrl(c.customerId),
    ...extra,
  };
}

/** Active team members holding any of these roles. */
export async function teamMembers(organizationId: string, roles?: string[]) {
  const members = await prisma.member.findMany({
    where: { organizationId, ...(roles ? { role: { in: roles } } : {}), disabledAt: null },
    select: { user: { select: { id: true, email: true } } },
  });
  const seen = new Set<string>();
  return members.map((m) => m.user).filter((u) => (seen.has(u.id) ? false : (seen.add(u.id), true)));
}

type Payload = Record<string, string | number | boolean | null | undefined>;

/** Email to a customer. WhatsApp never goes to customers, only to the kitchen's own team (AJ, 2026-10-09). */
export async function notifyCustomer(params: { organizationId: string; event: string; customerId?: string; email?: string | null; payload: Payload }) {
  // Promotional messages respect the customer's opt-out; everything they asked for is unaffected.
  if (isPromotionalEvent(params.event) && !(params.customerId && (await canSendPromotions(params.customerId)))) return;
  const payload = JSON.parse(JSON.stringify(params.payload));
  if (params.email) await notify({ organizationId: params.organizationId, channel: "EMAIL", event: params.event, recipient: { email: params.email }, payload });
}

/** The one number the kitchen's WhatsApp messages go to: the owner's phone, taken at signup. */
export async function kitchenWhatsAppPhone(organizationId: string): Promise<string | null> {
  const owner = await prisma.member.findFirst({ where: { organizationId, role: "owner", disabledAt: null }, orderBy: { createdAt: "asc" }, select: { user: { select: { phone: true } } } });
  return owner?.user.phone ? normalizePhone(owner.user.phone) : null;
}

/** One WhatsApp message to the kitchen. `params` fill the template's {{1}}, {{2}}... (see whatsapp/templates.ts). */
export async function notifyKitchenWhatsApp(organizationId: string, event: string, params: unknown[], dedupeKey?: string) {
  const phone = await kitchenWhatsAppPhone(organizationId);
  if (!phone) return;
  await notify({ organizationId, channel: "WHATSAPP", event, recipient: { phone }, payload: JSON.parse(JSON.stringify({ whatsappParams: params, ...(dedupeKey ? { dedupeKey } : {}) })) });
}

/** In-app (one row per person, so the bell can show each their own) and optionally email, to the team by role. */
export async function notifyTeam(params: { organizationId: string; roles?: string[]; event: string; title: string; message: string; email?: boolean; push?: boolean; payload: Payload }) {
  const payload = JSON.parse(JSON.stringify({ ...params.payload, title: params.title, message: params.message }));
  for (const user of await teamMembers(params.organizationId, params.roles)) {
    await notify({ organizationId: params.organizationId, channel: "IN_APP", event: params.event, recipient: { userId: user.id }, payload });
    if (params.push !== false) await notify({ organizationId: params.organizationId, channel: "PUSH", event: params.event, recipient: { userId: user.id }, payload });
    if (params.email) await notify({ organizationId: params.organizationId, channel: "EMAIL", event: params.event, recipient: { email: user.email, userId: user.id }, payload });
  }
}

/** A notice about the kitchen's account, to the whole team: bell, push and (if switched on) email. */
export function onSystemAlert(organizationId: string, alert: { title: string; message: string; href?: string; event?: string }) {
  return safely("onSystemAlert", async () => {
    const href = alert.href ?? "/settings/subscription";
    await notifyTeam({
      organizationId,
      event: "system.alert",
      email: true,
      title: alert.title,
      message: alert.message,
      payload: { href, url: canonicalUrl(href), kind: alert.event ?? "general" },
    });
  });
}

/** Platterly suspended, re-activated or deactivated a kitchen: the team is told. (Platform staff made the change in Ops, so they need no alert.) */
export function onTenantStatusChanged(organizationId: string, status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED") {
  return safely("onTenantStatusChanged", async () => {
    const copy = {
      SUSPENDED: ["Account suspended", "Your account has been suspended. Sign-in and your customer links are paused. Please contact Platterly to restore it."],
      DEACTIVATED: ["Account deactivated", "Your account has been deactivated. Please contact Platterly if this is unexpected."],
      ACTIVE: ["Account active again", "Your account is active again. Sign-in and your customer links work as before."],
    }[status];
    await onSystemAlert(organizationId, { title: copy[0], message: copy[1], event: `tenant.${status.toLowerCase()}` });
  });
}

/** A kitchen moved to another plan (not the trial that comes with sign-up). */
export function onPlanChanged(organizationId: string, planName: string, previousPlanName: string | null) {
  return safely("onPlanChanged", async () => {
    await onSystemAlert(organizationId, {
      title: "Your plan changed",
      message: previousPlanName ? `Your plan changed from ${previousPlanName} to ${planName}.` : `You are now on the ${planName} plan.`,
      event: "plan.changed",
    });
  });
}

/** The Platterly team switched a message channel off for this kitchen. */
export function onProviderDisconnected(organizationId: string, channel: string) {
  return onSystemAlert(organizationId, {
    title: `${channel} switched off`,
    message: `${channel} was switched off for your account, so those messages are not being sent. Contact Platterly if you did not expect this.`,
    href: `/settings/communication/${channel.toLowerCase()}-settings`,
    event: "provider.disconnected",
  });
}

const orderLabel = (c: OrderContext) => (c.orderNumber ? `Order ${c.orderNumber}` : "An order");

// --- triggers ---------------------------------------------------------------------------------------------

/** A new order exists (storefront submit, admin-created, converted quotation). */
export function onOrderCreated(organizationId: string, orderId: string) {
  return safely("onOrderCreated", async () => {
    const c = await loadOrderContext(organizationId, orderId);
    await notifyCustomer({ organizationId, event: "order.created", email: c.customerEmail, payload: emailPayload(c) });
    await notifyTeam({
      organizationId,
      event: "order.new_alert",
      email: true,
      title: "New order",
      message: `${orderLabel(c)} from ${c.customerName}${c.eventDate ? ` for ${c.eventDate}` : ""}.`,
      payload: emailPayload(c),
    });
    await notifyKitchenWhatsApp(organizationId, "order.new_alert", [c.orderNumber, c.customerName, c.eventDate]);
  });
}

const CUSTOMER_STATUS_UPDATES = new Set(["APPROVED", "SENT_TO_KITCHEN", "COMPLETED", "CANCELLED"]);

/** The order's status changed (automatic follow-the-menu or set by hand). */
export function onOrderStatusChanged(organizationId: string, orderId: string, status: string, note?: string | null) {
  return safely("onOrderStatusChanged", async () => {
    if (!CUSTOMER_STATUS_UPDATES.has(status)) return;
    const c = await loadOrderContext(organizationId, orderId);
    await notifyCustomer({ organizationId, event: "order.status_changed", email: c.customerEmail, payload: emailPayload(c, { status, note: note ?? undefined }) });
    if (status === "SENT_TO_KITCHEN") {
      await notifyTeam({
        organizationId,
          event: "order.sent_to_kitchen",
        title: "Order sent to kitchen",
        message: `${orderLabel(c)} for ${c.customerName}${c.eventDate ? ` (${c.eventDate})` : ""} is ready for preparation. Review the stock it needs on the order's Inventory tab.`,
        payload: emailPayload(c),
      });
      await notifyKitchenWhatsApp(organizationId, "order.sent_to_kitchen", [c.orderNumber, c.customerName, c.eventDate]);
    }
  });
}

/** The team sent a menu version to the customer for approval. */
export function onMenuSentForApproval(organizationId: string, orderId: string, versionNumber: number) {
  return safely("onMenuSentForApproval", async () => {
    const c = await loadOrderContext(organizationId, orderId);
    await notifyKitchenWhatsApp(organizationId, "menu_approval.sent", [c.orderNumber, c.customerName, versionNumber]);
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
      event: `menu_approval.${kind}`,
      title: text[0],
      message: `${c.customerName} ${text[1]}${c.orderNumber ? ` (${c.orderNumber})` : ""}.`,
      payload: emailPayload(c, extra),
    });
    if (kind === "approved") await notifyKitchenWhatsApp(organizationId, "menu_approval.approved", [c.customerName, c.orderNumber]);
  });
}

/** The customer accepted / rejected / asked changes on a quotation. */
export function onQuotationResponded(organizationId: string, quotationId: string, status: "ACCEPTED" | "REJECTED" | "CHANGES_REQUESTED") {
  const verb = { ACCEPTED: "accepted", REJECTED: "rejected", CHANGES_REQUESTED: "asked for changes to" }[status];
  return safely("onQuotationResponded", async () => {
    const q = await prisma.quotation.findFirstOrThrow({ where: { id: quotationId, organizationId }, select: { customer: { select: { name: true } } } });
    await notifyTeam({
      organizationId,
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
      event: kind === "received" ? "payment.received" : "payment.upi_claimed",
      email: true,
      title: kind === "received" ? "Payment received" : "UPI payment to confirm",
      message: `${c.customerName} ${kind === "received" ? "paid" : "says they paid"} ${formatInr(amount)}${c.orderNumber ? ` for ${c.orderNumber}` : ""}.`,
      payload: emailPayload(c, { amount }),
    });
    if (kind === "received") await notifyKitchenWhatsApp(organizationId, "payment.received", [c.customerName, formatInr(amount), c.orderNumber]);
  });
}

// --- staffing, tasks and dispatch (Chunk 19) --------------------------------------------------------------

/** In-app + push to one person (not the whole team): "you were scheduled", "a task is yours". */
export async function notifyUser(params: { organizationId: string; userId: string; event: string; title: string; message: string; payload: Payload }) {
  const payload = JSON.parse(JSON.stringify({ ...params.payload, title: params.title, message: params.message }));
  await notify({ organizationId: params.organizationId, channel: "IN_APP", event: params.event, recipient: { userId: params.userId }, payload });
  await notify({ organizationId: params.organizationId, channel: "PUSH", event: params.event, recipient: { userId: params.userId }, payload });
}

/** What a staffing / task / dispatch message calls the event: the order number and customer, else the event's own name. */
async function loadEventLabel(organizationId: string, eventId: string) {
  const e = await prisma.event.findFirstOrThrow({ where: { id: eventId, organizationId }, select: { name: true, startDate: true, order: { select: { orderNumber: true } }, customer: { select: { name: true } } } });
  const label = e.order?.orderNumber ? `${e.order.orderNumber} for ${e.customer.name}` : `${e.name} for ${e.customer.name}`;
  return { label, date: formatDate(e.startDate) };
}

/** The login user behind a Member id (floor staff have no login and get no alert). */
async function userOfMember(organizationId: string, memberId: string | null | undefined) {
  if (!memberId) return null;
  const m = await prisma.member.findFirst({ where: { id: memberId, organizationId, disabledAt: null }, select: { userId: true } });
  return m?.userId ?? null;
}

const DUTY_TEXT: Record<string, string> = { EVENT_MANAGER: "Event Manager", KITCHEN: "Kitchen", SERVING: "Serving", DELIVERY: "Delivery", SETUP: "Setup", STORE: "Store" };

/** A team member with a login was put on an event. Only they are told, and not when they scheduled themselves. */
export function onStaffAssigned(organizationId: string, eventId: string, memberId: string | null, duty: string, actorUserId: string) {
  return safely("onStaffAssigned", async () => {
    const userId = await userOfMember(organizationId, memberId);
    if (!userId || userId === actorUserId) return;
    const { label, date } = await loadEventLabel(organizationId, eventId);
    await notifyUser({
      organizationId,
      userId,
      event: "staff.assigned",
      title: "You are on an event",
      message: `You are scheduled for ${label}${date ? ` on ${date}` : ""} as ${DUTY_TEXT[duty] ?? duty}.`,
      payload: { href: `/staff/events/${eventId}`, eventId },
    });
  });
}

/** A task was given to someone with a login. Floor staff have no login, so the kitchen team passes it on. */
export function onTaskAssigned(organizationId: string, eventId: string, assignmentId: string | null | undefined, title: string, dueDate: Date | null, actorUserId: string) {
  return safely("onTaskAssigned", async () => {
    if (!assignmentId) return;
    const assignment = await prisma.staffAssignment.findFirst({ where: { id: assignmentId, organizationId }, select: { memberId: true } });
    const userId = await userOfMember(organizationId, assignment?.memberId);
    if (!userId || userId === actorUserId) return;
    const { label } = await loadEventLabel(organizationId, eventId);
    await notifyUser({
      organizationId,
      userId,
      event: "task.assigned",
      title: "A task is yours",
      message: `${title} (${label}${dueDate ? `, due ${formatDate(dueDate)}` : ""}).`,
      payload: { href: `/staff/events/${eventId}`, eventId },
    });
  });
}

/** The vehicle left or the food arrived. Everyone on the team is told, in-app and by push. */
export function onDispatchChanged(organizationId: string, eventId: string, status: "DISPATCHED" | "DELIVERED", driverName?: string | null) {
  return safely("onDispatchChanged", async () => {
    const { label } = await loadEventLabel(organizationId, eventId);
    await notifyTeam({
      organizationId,
      event: status === "DISPATCHED" ? "logistics.dispatched" : "logistics.delivered",
      title: status === "DISPATCHED" ? "Food is on the way" : "Food delivered",
      message: status === "DISPATCHED" ? `${label} has left${driverName ? ` with ${driverName}` : ""}.` : `${label} has been delivered.`,
      payload: { href: `/staff/events/${eventId}`, eventId },
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
  trialNotices: number;
  planNotices: number;
  eventReminders: number;
  paymentDue: number;
  paymentOverdue: number;
  taskDue: number;
  taskOverdue: number;
  kitchenWhatsApp: number;
}

/**
 * Called by the cron endpoint every few minutes. Each message is sent once: it carries a `dedupeKey`
 * (order + kind) and a run skips any order that already has a notification with it.
 *   event reminder: 2 days and 1 day before the event (customer by email/WhatsApp, kitchen in-app)
 *   payment due:    3 days before the event while a balance is open
 *   payment overdue: the day after the event while a balance is open
 */
/** "3 events to cater tomorrow" every day, and one overdue-payments digest on Mondays, per kitchen (owner's phone). */
async function sendKitchenWhatsAppDigests(now: Date, isMonday: boolean): Promise<number> {
  let sent = 0;
  const today = istDay(now, 0);
  const dayKey = today.toISOString().slice(0, 10);

  const tomorrow = await prisma.order.findMany({
    where: { status: { in: [...OPEN_STATUSES] }, eventStartDate: { gte: istDay(now, 1), lt: istDay(now, 2) } },
    select: { organizationId: true, customer: { select: { name: true } }, eventType: { select: { name: true } } },
  });
  const byKitchen = new Map<string, string[]>();
  for (const o of tomorrow) byKitchen.set(o.organizationId, [...(byKitchen.get(o.organizationId) ?? []), `${o.customer.name}${o.eventType ? ` (${o.eventType.name})` : ""}`]);
  for (const [organizationId, events] of byKitchen) {
    const key = `${organizationId}:tomorrow:${dayKey}`;
    if (await alreadySent(organizationId, "event.tomorrow_summary", key)) continue;
    await safely("tomorrow summary", async () => {
      const list = events.length > 5 ? `${events.slice(0, 5).join(", ")} and ${events.length - 5} more` : events.join(", ");
      await notifyKitchenWhatsApp(organizationId, "event.tomorrow_summary", [events.length, list], key);
      sent += 1;
    });
  }

  if (isMonday) {
    const past = await prisma.order.findMany({
      where: { status: { in: [...BILLABLE_STATUSES] }, eventStartDate: { gte: istDay(now, -365), lt: today } },
      select: { id: true, organizationId: true },
    });
    const totals = new Map<string, { count: number; balance: number }>();
    for (const { id, organizationId } of past) {
      const { balance } = await orderBalance(organizationId, id);
      if (balance > 0) totals.set(organizationId, { count: (totals.get(organizationId)?.count ?? 0) + 1, balance: (totals.get(organizationId)?.balance ?? 0) + balance });
    }
    for (const [organizationId, { count, balance }] of totals) {
      const key = `${organizationId}:overdue:${dayKey}`;
      if (await alreadySent(organizationId, "payment.overdue_digest", key)) continue;
      await safely("overdue digest", async () => {
        await notifyKitchenWhatsApp(organizationId, "payment.overdue_digest", [count, formatInr(balance)], key);
        sent += 1;
      });
    }
  }
  return sent;
}

export async function runDueNotifications(now: Date = new Date()): Promise<DueRunResult> {
  const result: DueRunResult = { trialNotices: 0, planNotices: 0, eventReminders: 0, paymentDue: 0, paymentOverdue: 0, taskDue: 0, taskOverdue: 0, kitchenWhatsApp: 0 };

  // With OPS_BILLING on, ops owns the subscription and sends these emails itself (docs/ops-contract.md 9), so the local
  // trial and paid-plan notices below are skipped: the rows they read are no longer the truth.
  const opsSendsPlanNotices = opsBillingOn();

  // Trial ending: 3 days and 1 day before, and once it has ended.
  const trials = opsSendsPlanNotices ? [] : await prisma.subscription.findMany({
    where: { status: "TRIALING", endDate: null, trialEndsAt: { not: null } },
    select: { id: true, organizationId: true, trialEndsAt: true },
  });
  for (const trial of trials) {
    const ends = trial.trialEndsAt!;
    const daysLeft = Math.round((istDay(ends, 0).getTime() - istDay(now, 0).getTime()) / DAY_MS);
    const stage = daysLeft === 3 ? "3" : daysLeft === 1 ? "1" : daysLeft < 0 && daysLeft >= -7 ? "ended" : null;
    if (!stage) continue;
    const key = `${trial.id}:trial:${stage}`;
    if (await alreadySent(trial.organizationId, "system.alert", key)) continue;
    await safely("trial notice", async () => {
      const text =
        stage === "ended"
          ? { title: "Your free trial has ended", message: "Your free trial has ended. Choose a plan to keep every feature." }
          : { title: `Your trial ends in ${stage} day${stage === "1" ? "" : "s"}`, message: `Your free trial ends in ${stage} day${stage === "1" ? "" : "s"}. Upgrade to keep every feature.` };
      await notifyTeam({ organizationId: trial.organizationId, event: "system.alert", email: true, title: text.title, message: text.message, payload: { href: "/subscribe", url: canonicalUrl("/subscribe"), dedupeKey: key } });
      result.trialNotices += 1;
    });
  }

  // Paid plan ending (Chunk 20): 3 days and 1 day before the paid period runs out, and once it has. Renewing moves the
  // period end, which starts a fresh set of keys.
  const paid = opsSendsPlanNotices ? [] : await prisma.subscription.findMany({
    where: { status: "ACTIVE", endDate: null, currentPeriodEnd: { not: null } },
    select: { id: true, organizationId: true, currentPeriodEnd: true },
  });
  for (const plan of paid) {
    const ends = plan.currentPeriodEnd!;
    const daysLeft = Math.round((istDay(ends, 0).getTime() - istDay(now, 0).getTime()) / DAY_MS);
    const stage = daysLeft === 3 ? "3" : daysLeft === 1 ? "1" : daysLeft < 0 && daysLeft >= -7 ? "ended" : null;
    if (!stage) continue;
    const key = `${plan.id}:${ends.getTime()}:plan:${stage}`;
    if (await alreadySent(plan.organizationId, "system.alert", key)) continue;
    await safely("plan notice", async () => {
      const text =
        stage === "ended"
          ? { title: "Your plan has ended", message: "Your plan has ended and your account is locked. Renew to get back in; nothing has been deleted." }
          : { title: `Your plan ends in ${stage} day${stage === "1" ? "" : "s"}`, message: `Your plan ends in ${stage} day${stage === "1" ? "" : "s"}. Renew to keep your account open.` };
      await notifyTeam({ organizationId: plan.organizationId, event: "system.alert", email: true, title: text.title, message: text.message, payload: { href: "/subscribe", url: canonicalUrl("/subscribe"), dedupeKey: key } });
      result.planNotices += 1;
    });
  }

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
        await notifyCustomer({ organizationId, event: "event.reminder", email: c.customerEmail, payload });
        if (daysBefore === 1) {
          await notifyTeam({
            organizationId,
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

  // WhatsApp to each kitchen's owner, from 8 am India time: tomorrow's events (daily) and overdue payments (Mondays).
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  if (istNow.getUTCHours() >= 8) {
    result.kitchenWhatsApp += await sendKitchenWhatsAppDigests(now, istNow.getUTCDay() === 1);
  }

  for (const { id, organizationId } of await eventsOn(3, BILLABLE_STATUSES)) {
    const key = `${id}:due`;
    if (await alreadySent(organizationId, "payment.due", key)) continue;
    await safely("payment due", async () => {
      const c = await loadOrderContext(organizationId, id);
      if (c.balance <= 0) return;
      await notifyCustomer({ organizationId, event: "payment.due", email: c.customerEmail, payload: emailPayload(c, { dedupeKey: key }) });
      result.paymentDue += 1;
    });
  }

  for (const { id, organizationId } of await eventsOn(-1, BILLABLE_STATUSES)) {
    const key = `${id}:overdue`;
    if (await alreadySent(organizationId, "payment.overdue", key)) continue;
    await safely("payment overdue", async () => {
      const c = await loadOrderContext(organizationId, id);
      if (c.balance <= 0) return;
      await notifyCustomer({ organizationId, event: "payment.overdue", email: c.customerEmail, payload: emailPayload(c, { dedupeKey: key }) });
      result.paymentOverdue += 1;
    });
  }

  // Event tasks: once on the day they are due and once the day after, while still open. The person it was given to
  // is told; a task with nobody, or given to floor staff (no login), goes to the whole team.
  const tasksOn = (offset: number) =>
    prisma.eventTask.findMany({
      where: { done: false, dueDate: { gte: istDay(now, offset), lt: istDay(now, offset + 1) }, event: { OR: [{ orderId: null }, { order: { status: { notIn: ["CANCELLED", "COMPLETED"] } } }] } },
      select: { id: true, organizationId: true, eventId: true, title: true, assignment: { select: { memberId: true } } },
    });
  for (const [offset, kind] of [[0, "due"], [-1, "overdue"]] as const) {
    for (const task of await tasksOn(offset)) {
      const key = `${task.id}:${kind}`;
      if (await alreadySent(task.organizationId, `task.${kind}`, key)) continue;
      await safely(`task ${kind}`, async () => {
        const { label } = await loadEventLabel(task.organizationId, task.eventId);
        const text = { title: kind === "due" ? "Task due today" : "Task overdue", message: `${task.title} (${label}) ${kind === "due" ? "is due today" : "was due yesterday and is not done"}.` };
        const payload = { href: `/staff/events/${task.eventId}`, eventId: task.eventId, dedupeKey: key };
        const userId = await userOfMember(task.organizationId, task.assignment?.memberId);
        if (userId) await notifyUser({ organizationId: task.organizationId, userId, event: `task.${kind}`, ...text, payload });
        else await notifyTeam({ organizationId: task.organizationId, event: `task.${kind}`, ...text, payload });
        if (kind === "due") result.taskDue += 1;
        else result.taskOverdue += 1;
      });
    }
  }

  return result;
}
