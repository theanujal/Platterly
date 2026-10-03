import { formatInr } from "@/lib/format-currency";
import { escapeHtml, p, renderEmail } from "./layout";

export interface RenderedEmail {
  subject: string;
  html: string;
}

/**
 * What a customer/kitchen email may mention. Every field is optional so a caller sends what it has and the
 * template drops the rest (no "undefined" ever reaches an inbox).
 */
export interface EmailData {
  kitchenName?: string;
  customerName?: string;
  orderNumber?: string;
  eventDate?: string;
  eventAddress?: string;
  eventType?: string;
  amount?: number;
  balance?: number;
  documentNumber?: string;
  url?: string;
  versionNumber?: number;
  status?: string;
  note?: string;
  /** A caterer-edited message body from Settings (with {{variables}}); replaces the default paragraph. */
  customBody?: string;
}

const SECURITY_NOTE = "Platterly will never ask you to share your OTP, password, or account access details outside the platform.";

function applyVariables(text: string, d: EmailData): string {
  const map: Record<string, string> = {
    customer_name: d.customerName ?? "",
    order_number: d.orderNumber ?? "",
    event_date: d.eventDate ?? "",
    event_address: d.eventAddress ?? "",
  };
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => map[key] ?? "");
}

/** A caterer's message body: blank lines split paragraphs, single newlines stay as line breaks. */
function customBodyHtml(text: string, d: EmailData): string {
  return applyVariables(text, d)
    .split(/\n{2,}/)
    .map((para) => p(escapeHtml(para.trim()).replace(/\n/g, "<br>")))
    .join("");
}

function rows(entries: Array<[string, string | undefined | null]>): Array<[string, string]> {
  return entries.filter((e): e is [string, string] => Boolean(e[1]));
}

function customerGreeting(d: EmailData): string {
  return d.customerName ? `Dear ${d.customerName},` : "Hello,";
}

function kitchenSignOff(d: EmailData): string | undefined {
  return d.kitchenName;
}

function money(n: number | undefined): string | undefined {
  return n === undefined ? undefined : formatInr(n);
}

const orderRef = (d: EmailData) => (d.orderNumber ? ` ${d.orderNumber}` : "");

// --- Account ---------------------------------------------------------------------------------------------

/** The 6-digit sign-up code (AJ's sample). `expiresInMinutes` must match the emailOTP plugin's `expiresIn`. */
export function verificationCodeEmail(code: string, expiresInMinutes: number): RenderedEmail {
  return {
    subject: "Platterly Account Verification",
    html: renderEmail({
      tag: "Account Verification",
      eyebrow: "Registration OTP",
      title: "Verify your Platterly account",
      greeting: "Dear Caterer,",
      bodyHtml: p("Welcome to Platterly. Use the verification code below to complete your registration and activate your account."),
      code: { label: "Your verification code", value: code, note: `Valid for ${expiresInMinutes} minutes` },
      afterCodeHtml:
        p(`This code is valid for <strong>${expiresInMinutes} minutes</strong>. For your security, please do not share this code with anyone.`) +
        p("If you did not request this code, you can safely ignore this email."),
      securityNote: SECURITY_NOTE,
    }),
  };
}

/** Password reset code (same code box as sign-up). */
export function passwordResetEmail(code: string, expiresInMinutes: number): RenderedEmail {
  return {
    subject: "Platterly Password Reset",
    html: renderEmail({
      tag: "Password Reset",
      eyebrow: "Reset your password",
      title: "Reset your Platterly password",
      greeting: "Hello,",
      bodyHtml: p("We received a request to reset the password for your Platterly account. Use the code below to choose a new one."),
      code: { label: "Your reset code", value: code, note: `Valid for ${expiresInMinutes} minutes` },
      afterCodeHtml: p("If you did not ask to reset your password, you can safely ignore this email. Your password will not change."),
      securityNote: SECURITY_NOTE,
    }),
  };
}

/** Team invitation (event `team.invitation_sent`). */
export function teamInvitationEmail(payload: Record<string, unknown>): RenderedEmail {
  const org = String(payload.organizationName ?? "a Platterly kitchen");
  const inviter = String(payload.inviterName ?? "A teammate");
  const url = String(payload.acceptUrl ?? "");
  const hours = Number(payload.expiresInHours ?? 48);
  return {
    subject: `${inviter} invited you to join ${org} on Platterly`,
    html: renderEmail({
      tag: "Team Invitation",
      eyebrow: "You're invited",
      title: `Join ${org}`,
      greeting: "Hello,",
      bodyHtml: p(`${escapeHtml(inviter)} has invited you to join <strong>${escapeHtml(org)}</strong> on Platterly.`),
      cta: { label: "Accept invitation", url },
      afterCodeHtml: p(`This link is valid for ${hours} hours. If you were not expecting it, you can safely ignore this email.`),
    }),
  };
}

/** Kitchen owner: trial ending, provider disconnected, failed sends... */
export function systemAlertEmail(d: EmailData & { title: string; message: string }): RenderedEmail {
  return {
    subject: `Platterly: ${d.title}`,
    html: renderEmail({
      tag: "System Alert",
      eyebrow: "Needs your attention",
      title: d.title,
      greeting: "Hello,",
      bodyHtml: p(escapeHtml(d.message)),
      cta: d.url ? { label: "Open Platterly", url: d.url } : undefined,
    }),
  };
}

// --- Orders ----------------------------------------------------------------------------------------------

/** To the customer when an order is created. Uses the caterer's own wording from Settings when they edited it. */
export function orderConfirmationEmail(d: EmailData): RenderedEmail {
  return {
    subject: `Order${orderRef(d)} received${d.kitchenName ? ` by ${d.kitchenName}` : ""}`,
    html: renderEmail({
      tag: "Order Confirmation",
      eyebrow: "Order received",
      title: "We have received your order",
      greeting: customerGreeting(d),
      bodyHtml: d.customBody ? customBodyHtml(d.customBody, d) : p("Thank you for choosing us. We have received your order and our team will be in touch shortly."),
      details: rows([["Order", d.orderNumber], ["Event", d.eventType], ["Event date", d.eventDate], ["Venue", d.eventAddress], ["Order total", money(d.amount)]]),
      cta: d.url ? { label: "View your order", url: d.url } : undefined,
      signOff: kitchenSignOff(d),
    }),
  };
}

/** To the kitchen owner / Sales when a new order comes in. */
export function newOrderAlertEmail(d: EmailData): RenderedEmail {
  return {
    subject: `New order${orderRef(d)}${d.customerName ? ` from ${d.customerName}` : ""}`,
    html: renderEmail({
      tag: "New Order",
      eyebrow: "New order alert",
      title: "You have a new order",
      greeting: "Hello,",
      bodyHtml: d.customBody ? customBodyHtml(d.customBody, d) : p("A new order has just come in. Log in to Platterly to review it."),
      details: rows([["Customer", d.customerName], ["Order", d.orderNumber], ["Event", d.eventType], ["Event date", d.eventDate], ["Venue", d.eventAddress]]),
      cta: d.url ? { label: "Review order", url: d.url } : undefined,
    }),
  };
}

const STATUS_COPY: Record<string, { title: string; line: string }> = {
  APPROVED: { title: "Your order is approved", line: "Your menu is approved and your order is confirmed." },
  SENT_TO_KITCHEN: { title: "Your order is with our kitchen", line: "Your order has been handed to our kitchen team for preparation." },
  COMPLETED: { title: "Your order is complete", line: "Your order is complete. Thank you for choosing us." },
  CANCELLED: { title: "Your order was cancelled", line: "Your order has been cancelled. Please get in touch with us if this is unexpected." },
};

/** To the customer when the order status changes. */
export function orderStatusEmail(d: EmailData): RenderedEmail {
  const copy = STATUS_COPY[d.status ?? ""] ?? { title: "Your order was updated", line: "There is an update on your order." };
  return {
    subject: `${copy.title}${d.orderNumber ? ` (${d.orderNumber})` : ""}`,
    html: renderEmail({
      tag: "Order Update",
      eyebrow: "Order status",
      title: copy.title,
      greeting: customerGreeting(d),
      bodyHtml: p(escapeHtml(copy.line)) + (d.note ? p(escapeHtml(d.note)) : ""),
      details: rows([["Order", d.orderNumber], ["Event date", d.eventDate]]),
      cta: d.url ? { label: "View your order", url: d.url } : undefined,
      signOff: kitchenSignOff(d),
    }),
  };
}

// --- Quotation and menu ----------------------------------------------------------------------------------

export function quotationSentEmail(d: EmailData): RenderedEmail {
  return {
    subject: `Your quotation${d.kitchenName ? ` from ${d.kitchenName}` : ""}`,
    html: renderEmail({
      tag: "Quotation",
      eyebrow: "Your quotation",
      title: "Your quotation is ready",
      greeting: customerGreeting(d),
      bodyHtml: p("We have prepared a quotation for you. Please review it and let us know if you would like to go ahead or change anything."),
      details: rows([["Event", d.eventType], ["Event date", d.eventDate], ["Quotation total", money(d.amount)]]),
      cta: d.url ? { label: "Review quotation", url: d.url } : undefined,
      signOff: kitchenSignOff(d),
    }),
  };
}

export function menuApprovalEmail(d: EmailData): RenderedEmail {
  const revised = (d.versionNumber ?? 1) > 1;
  return {
    subject: revised ? "Your revised menu is ready for approval" : "Your menu is ready for approval",
    html: renderEmail({
      tag: "Menu Approval",
      eyebrow: revised ? "Revised menu" : "Menu for approval",
      title: revised ? "Please review your revised menu" : "Please review your menu",
      greeting: customerGreeting(d),
      bodyHtml: p(
        revised
          ? "We have updated your menu based on your feedback. Please review the new version and approve it, or tell us what to change."
          : "Your menu is ready. Please review it and approve it, or tell us what you would like changed.",
      ),
      details: rows([["Order", d.orderNumber], ["Event date", d.eventDate], ["Menu version", d.versionNumber ? `Version ${d.versionNumber}` : undefined]]),
      cta: d.url ? { label: "Review menu", url: d.url } : undefined,
      signOff: kitchenSignOff(d),
    }),
  };
}

// --- Payments --------------------------------------------------------------------------------------------

export function invoiceEmail(d: EmailData): RenderedEmail {
  return {
    subject: `Invoice${d.documentNumber ? ` ${d.documentNumber}` : ""}${d.kitchenName ? ` from ${d.kitchenName}` : ""}`,
    html: renderEmail({
      tag: "Invoice",
      eyebrow: "Your invoice",
      title: "Your invoice is ready",
      greeting: customerGreeting(d),
      bodyHtml: p("Please find your invoice below. You can view, download and pay it from the link."),
      details: rows([["Invoice", d.documentNumber], ["Order", d.orderNumber], ["Amount", money(d.amount)]]),
      cta: d.url ? { label: "View invoice", url: d.url } : undefined,
      signOff: kitchenSignOff(d),
    }),
  };
}

export function receiptEmail(d: EmailData): RenderedEmail {
  return {
    subject: `Payment receipt${d.documentNumber ? ` ${d.documentNumber}` : ""}`,
    html: renderEmail({
      tag: "Receipt",
      eyebrow: "Payment received",
      title: "Thank you, we received your payment",
      greeting: customerGreeting(d),
      bodyHtml: p("This is your receipt. Keep it for your records."),
      details: rows([["Receipt", d.documentNumber], ["Order", d.orderNumber], ["Amount paid", money(d.amount)], ["Balance", d.balance === undefined ? undefined : money(d.balance)]]),
      cta: d.url ? { label: "View receipt", url: d.url } : undefined,
      signOff: kitchenSignOff(d),
    }),
  };
}

export function paymentLinkEmail(d: EmailData): RenderedEmail {
  return {
    subject: `Payment request${d.orderNumber ? ` for order ${d.orderNumber}` : ""}`,
    html: renderEmail({
      tag: "Payment Request",
      eyebrow: "Payment request",
      title: "Your payment link is ready",
      greeting: customerGreeting(d),
      bodyHtml: p("Please use the secure link below to make your payment."),
      details: rows([["Order", d.orderNumber], ["Amount due", money(d.amount)]]),
      cta: d.url ? { label: "Pay now", url: d.url } : undefined,
      signOff: kitchenSignOff(d),
    }),
  };
}

/** To the kitchen's Accounts people: a payment arrived, or a UPI claim needs confirming. */
export function paymentAlertEmail(d: EmailData & { needsConfirmation?: boolean }): RenderedEmail {
  return {
    subject: d.needsConfirmation ? "A UPI payment needs your confirmation" : `Payment received${d.orderNumber ? ` for order ${d.orderNumber}` : ""}`,
    html: renderEmail({
      tag: "Payment",
      eyebrow: d.needsConfirmation ? "Confirm payment" : "Payment received",
      title: d.needsConfirmation ? "Please confirm a UPI payment" : "A payment was received",
      greeting: "Hello,",
      bodyHtml: p(d.needsConfirmation ? "A customer says they have paid by UPI. Check your account and confirm it in Platterly." : "A customer payment has just been recorded."),
      details: rows([["Customer", d.customerName], ["Order", d.orderNumber], ["Amount", money(d.amount)]]),
      cta: d.url ? { label: "Open payments", url: d.url } : undefined,
    }),
  };
}

// --- Reminders -------------------------------------------------------------------------------------------

/** To the customer, 2 days and 1 day before the event. */
export function eventReminderEmail(d: EmailData & { daysBefore: number }): RenderedEmail {
  const when = d.daysBefore <= 1 ? "tomorrow" : `in ${d.daysBefore} days`;
  return {
    subject: `Reminder: your event is ${when}`,
    html: renderEmail({
      tag: "Event Reminder",
      eyebrow: "Event reminder",
      title: `Your event is ${when}`,
      greeting: customerGreeting(d),
      bodyHtml: p("This is a friendly reminder about your upcoming event. We look forward to serving you."),
      details: rows([["Event", d.eventType], ["Date", d.eventDate], ["Venue", d.eventAddress], ["Order", d.orderNumber]]),
      cta: d.url ? { label: "View order", url: d.url } : undefined,
      signOff: kitchenSignOff(d),
    }),
  };
}

/** To the customer: a balance is coming due, or is overdue. */
export function paymentDueEmail(d: EmailData & { overdue?: boolean }): RenderedEmail {
  return {
    subject: d.overdue ? `Payment overdue${d.orderNumber ? ` for order ${d.orderNumber}` : ""}` : `Payment reminder${d.orderNumber ? ` for order ${d.orderNumber}` : ""}`,
    html: renderEmail({
      tag: "Payment Reminder",
      eyebrow: d.overdue ? "Payment overdue" : "Payment due soon",
      title: d.overdue ? "Your payment is overdue" : "A payment is due soon",
      greeting: customerGreeting(d),
      bodyHtml: p(d.overdue ? "Our records show a balance is still pending. Please settle it at your earliest convenience." : "This is a reminder that a payment for your order is coming due."),
      details: rows([["Order", d.orderNumber], ["Event date", d.eventDate], ["Balance due", money(d.balance ?? d.amount)]]),
      cta: d.url ? { label: "Pay now", url: d.url } : undefined,
      signOff: kitchenSignOff(d),
    }),
  };
}

// --- Event key -> email ----------------------------------------------------------------------------------

function pick(data: Record<string, unknown>): EmailData {
  const text = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : undefined);
  return {
    kitchenName: text(data.kitchenName),
    customerName: text(data.customerName),
    orderNumber: text(data.orderNumber),
    eventDate: text(data.eventDate),
    eventAddress: text(data.eventAddress),
    eventType: text(data.eventType),
    amount: num(data.amount) ?? num(data.total),
    balance: num(data.balance),
    documentNumber: text(data.number),
    url: text(data.url),
    versionNumber: num(data.versionNumber),
    status: text(data.status),
    note: text(data.note),
    customBody: text(data.customBody),
  };
}

/**
 * Event key -> the customer/kitchen email for it. `null` = no email for this event (stays log-only), which
 * also covers events that are in-app only (e.g. `menu_approval.changes_requested`).
 */
export function emailForEvent(event: string, payload: unknown): RenderedEmail | null {
  const data = (payload ?? {}) as Record<string, unknown>;
  const d = pick(data);
  switch (event) {
    case "team.invitation_sent":
      return teamInvitationEmail(data);
    case "order.created":
    case "order.create_and_notify":
      return orderConfirmationEmail(d);
    case "order.new_alert":
      return newOrderAlertEmail(d);
    case "order.status_changed":
      return orderStatusEmail(d);
    case "quotation.sent":
      return quotationSentEmail(d);
    case "menu_approval.sent":
      return menuApprovalEmail(d);
    case "invoice.sent":
      return invoiceEmail(d);
    case "receipt.sent":
      return receiptEmail(d);
    case "payment.link_sent":
      return paymentLinkEmail(d);
    case "payment.received":
      return paymentAlertEmail(d);
    case "payment.upi_claimed":
      return paymentAlertEmail({ ...d, needsConfirmation: true });
    case "payment.due":
      return paymentDueEmail(d);
    case "payment.overdue":
      return paymentDueEmail({ ...d, overdue: true });
    case "event.reminder":
      return eventReminderEmail({ ...d, daysBefore: Number(data.daysBefore ?? 1) });
    case "system.alert":
      return systemAlertEmail({ ...d, title: String(data.title ?? "Notice"), message: String(data.message ?? "") });
    default:
      return null;
  }
}
