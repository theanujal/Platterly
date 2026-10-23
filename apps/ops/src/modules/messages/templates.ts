import { escapeHtml, p, renderEmail } from "./layout";
import { cleanParams } from "./wacrm";

/**
 * The messages ops can send to a business owner (docs/ops-contract.md 9). A product asks for one by key with a few plain
 * variables; ops owns the wording and the design. A template that is not in this list is refused, never guessed at.
 * Variables are text or numbers only and are always escaped, so a product can never inject markup into an email.
 */
export type Variables = Record<string, string | number>;
export interface MessageContext {
  businessName: string;
  ownerName: string;
  productName: string;
  /** The product's own address, for buttons that open a page inside it. */
  productUrl: string;
}
export interface Rendered {
  subject: string;
  html: string;
}
interface Template {
  /** Variables the template cannot be written without. */
  requires: string[];
  render(v: Variables, c: MessageContext): Rendered;
  /** Also sent on WhatsApp as this approved Meta template (Sharath, 2026-10-23). `body` is the template's wording, sent as plain text until it is approved. */
  whatsapp?: { name: string; body: string; params(v: Variables, c: MessageContext): string[] };
}

const text = (v: Variables, key: string, fallback = "") => String(v[key] ?? fallback);
const greet = (c: MessageContext) => `Dear ${c.ownerName || "there"},`;
const inr = (value: string | number) => `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export const TEMPLATES: Record<string, Template> = {
  welcome_owner: {
    requires: [],
    render: (_v, c) => ({
      subject: `Welcome to Platterly ${c.productName}`,
      html: renderEmail({
        tag: "Welcome",
        eyebrow: "You're all set",
        title: `Welcome to Platterly ${c.productName}`,
        greeting: greet(c),
        bodyHtml: p(`Thank you for choosing Platterly. <strong>${escapeHtml(c.businessName)}</strong> is ready, and your free trial has started.`) + p("Add your menu, take your first order and see how much time the rest saves you."),
        cta: { label: `Open ${c.productName}`, url: c.productUrl },
      }),
    }),
  },
  trial_ending: {
    requires: ["daysLeft"],
    render: (v, c) => {
      const days = Number(v.daysLeft);
      return {
        subject: `Your Platterly trial ends in ${plural(days, "day")}`,
        html: renderEmail({
          tag: "Trial",
          eyebrow: "Your trial is ending",
          title: `Your trial ends in ${plural(days, "day")}`,
          greeting: greet(c),
          bodyHtml: p(`The free trial for <strong>${escapeHtml(c.businessName)}</strong> ends in ${plural(days, "day")}. Choose a plan to keep every feature and your data exactly as it is.`),
          cta: { label: "Choose a plan", url: `${c.productUrl}/subscribe` },
        }),
      };
    },
  },
  trial_ended: {
    requires: [],
    render: (_v, c) => ({
      subject: "Your Platterly trial has ended",
      html: renderEmail({
        tag: "Trial",
        eyebrow: "Your trial has ended",
        title: "Your free trial has ended",
        greeting: greet(c),
        bodyHtml: p(`The free trial for <strong>${escapeHtml(c.businessName)}</strong> has ended. Nothing has been deleted: choose a plan and you can carry on where you left off.`),
        cta: { label: "Choose a plan", url: `${c.productUrl}/subscribe` },
      }),
    }),
  },
  plan_grace: {
    requires: ["daysLeft", "endsOn"],
    render: (v, c) => {
      const days = Number(v.daysLeft);
      // A paused auto-pay comes back with Resume, not a new payment.
      const act = v.paused ? "resume" : "renew";
      return {
        subject: days <= 1 ? `Last day to ${act} your Platterly plan` : `Your Platterly plan has ended: ${plural(days, "day")} to ${act}`,
        html: renderEmail({
          tag: "Plan",
          eyebrow: "Payment overdue",
          title: days <= 1 ? `Today is the last day to ${act}` : `You have ${plural(days, "day")} to ${act}`,
          greeting: greet(c),
          bodyHtml: p(`The paid plan for <strong>${escapeHtml(c.businessName)}</strong> has ended. Everything still works, but if it is not ${act}d by <strong>${escapeHtml(text(v, "endsOn"))}</strong> your account will be locked.`) + p(`Nothing is deleted when an account is locked: ${act} and you carry on exactly where you left off.`),
          cta: v.paused ? { label: "Resume", url: `${c.productUrl}/settings/subscription` } : { label: "Renew now", url: `${c.productUrl}/subscribe` },
        }),
      };
    },
    whatsapp: { name: "platterly_plan_grace", body: "Hi {{1}}, your Platterly plan has ended. Everything still works, but your account will be locked on {{2}} unless the plan is renewed. Renew here: {{3}} Nothing is deleted.", params: (v, c) => [c.businessName, text(v, "endsOn"), v.paused ? `${c.productUrl}/settings/subscription` : `${c.productUrl}/subscribe`] },
  },
  plan_renewal_due: {
    requires: ["daysLeft", "endsOn", "planName"],
    render: (v, c) => {
      const days = Number(v.daysLeft);
      const resume = Boolean(v.paused);
      return {
        subject: days === 0 ? "Your Platterly plan renews today" : days === 1 ? "Your Platterly plan ends tomorrow" : `Your Platterly plan ends in ${plural(days, "day")}`,
        html: renderEmail({
          tag: "Plan",
          eyebrow: "Renewal due",
          title: days === 0 ? "Your plan renews today" : `Your plan ends on ${escapeHtml(text(v, "endsOn"))}`,
          greeting: greet(c),
          bodyHtml: p(`The <strong>${escapeHtml(text(v, "planName"))}</strong> plan for <strong>${escapeHtml(c.businessName)}</strong> ends on <strong>${escapeHtml(text(v, "endsOn"))}</strong>. ${resume ? "Resume auto-pay" : "Renew"} before then to carry on without a break.`),
          cta: resume ? { label: "Resume", url: `${c.productUrl}/settings/subscription` } : { label: "Renew now", url: `${c.productUrl}/subscribe` },
        }),
      };
    },
    whatsapp: { name: "platterly_plan_renewal_due", body: "Hi {{1}}, your {{2}} plan ends {{3}}. Renew here to keep using Platterly without a break: {{4}} Thank you.", params: (v, c) => [c.businessName, text(v, "planName", "Platterly"), Number(v.daysLeft) === 0 ? "today" : `on ${text(v, "endsOn")} (in ${plural(Number(v.daysLeft), "day")})`, v.paused ? `${c.productUrl}/settings/subscription` : `${c.productUrl}/subscribe`] },
  },
  plan_locked: {
    requires: [],
    render: (_v, c) => ({
      subject: "Your Platterly account is locked",
      html: renderEmail({
        tag: "Plan",
        eyebrow: "Account locked",
        title: "Your account is locked",
        greeting: greet(c),
        bodyHtml: p(`The 7 days to renew the plan for <strong>${escapeHtml(c.businessName)}</strong> have passed, so the account is locked. Nothing has been deleted: renew and you can carry on where you left off.`),
        cta: { label: "Renew now", url: `${c.productUrl}/subscribe` },
      }),
    }),
    whatsapp: { name: "platterly_plan_locked", body: "Hi {{1}}, the 7 days to renew your Platterly plan have passed, so your account is locked. Nothing is deleted. Renew here to carry on where you left off: {{2}} Thank you.", params: (_v, c) => [c.businessName, `${c.productUrl}/subscribe`] },
  },
  payment_received: {
    requires: ["planName", "amount"],
    render: (v, c) => ({
      subject: `Payment received for ${text(v, "planName")}`,
      html: renderEmail({
        tag: "Payment",
        eyebrow: "Payment received",
        title: "Thank you, we have your payment",
        greeting: greet(c),
        bodyHtml: p(`We received your payment for <strong>${escapeHtml(c.businessName)}</strong>. Your plan is active.`),
        details: [["Plan", text(v, "planName")], ["Amount (with GST)", inr(text(v, "amount"))], ...(v.invoiceNumber ? ([["Invoice", text(v, "invoiceNumber")]] as Array<[string, string]>) : []), ...(v.validUntil ? ([["Valid until", text(v, "validUntil")]] as Array<[string, string]>) : [])],
        cta: { label: "View subscription", url: `${c.productUrl}/settings/subscription` },
      }),
    }),
    whatsapp: { name: "platterly_plan_payment_received", body: "Hi {{1}}, we received your payment of {{2}} for the {{3}} plan. Your plan is active until {{4}}. Invoice {{5}} is in Settings > Subscription in Platterly.", params: (v, c) => [c.businessName, inr(text(v, "amount")), text(v, "planName"), text(v, "validUntil"), text(v, "invoiceNumber")] },
  },
  stand_placed: {
    requires: ["quantity", "amount"],
    render: (v, c) => ({
      subject: `We received your Order QR stand order`,
      html: renderEmail({
        tag: "Order QR stand",
        eyebrow: "Order placed",
        title: "Thank you, your stands are on their way to print",
        greeting: greet(c),
        bodyHtml: p(`We received your order for <strong>${plural(Number(v.quantity), "Order QR stand")}</strong> for <strong>${escapeHtml(c.businessName)}</strong>. We will print them and email you again when they ship.`),
        details: [["Stands", String(v.quantity)], ["Amount (with GST)", inr(text(v, "amount"))], ...(v.invoiceNumber ? ([["Invoice", text(v, "invoiceNumber")]] as Array<[string, string]>) : [])],
        cta: { label: "View your order", url: `${c.productUrl}/settings/integration/public-menu-link` },
      }),
    }),
  },
  stand_shipped: {
    requires: ["quantity"],
    render: (v, c) => ({
      subject: "Your Order QR stand has shipped",
      html: renderEmail({
        tag: "Order QR stand",
        eyebrow: "Shipped",
        title: "Your Order QR stand is on its way",
        greeting: greet(c),
        bodyHtml: p(`Your order of <strong>${plural(Number(v.quantity), "Order QR stand")}</strong> for <strong>${escapeHtml(c.businessName)}</strong> has shipped to your address.`) + (v.trackingNote ? p(`Delivery note: ${escapeHtml(text(v, "trackingNote"))}`) : "") + p("Keep your public link the same: the QR printed on the stand points to it."),
        cta: { label: "View your order", url: `${c.productUrl}/settings/integration/public-menu-link` },
      }),
    }),
  },
  plan_changed: {
    requires: ["planName"],
    render: (v, c) => ({
      subject: "Your Platterly plan changed",
      html: renderEmail({
        tag: "Plan",
        eyebrow: "Your plan changed",
        title: "Your plan has changed",
        greeting: greet(c),
        bodyHtml: p(v.previousPlanName ? `The plan for <strong>${escapeHtml(c.businessName)}</strong> changed from <strong>${escapeHtml(text(v, "previousPlanName"))}</strong> to <strong>${escapeHtml(text(v, "planName"))}</strong>.` : `<strong>${escapeHtml(c.businessName)}</strong> is now on the <strong>${escapeHtml(text(v, "planName"))}</strong> plan.`),
        cta: { label: "View subscription", url: `${c.productUrl}/settings/subscription` },
      }),
    }),
  },
  payment_failed: {
    requires: ["planName"],
    render: (v, c) => ({
      subject: "Your Platterly payment did not go through",
      html: renderEmail({
        tag: "Payment",
        eyebrow: "Payment failed",
        title: "Your payment did not go through",
        greeting: greet(c),
        bodyHtml: p(`We could not take the payment for the <strong>${escapeHtml(text(v, "planName"))}</strong> plan of <strong>${escapeHtml(c.businessName)}</strong>. No money has been kept. You can try again, or use another way to pay.`),
        cta: { label: "Try again", url: `${c.productUrl}/subscribe` },
      }),
    }),
  },
  autopay_failed: {
    requires: ["planName"],
    render: (v, c) => ({
      subject: "We could not take your Platterly auto-pay",
      html: renderEmail({
        tag: "Payment",
        eyebrow: "Auto-pay failed",
        title: "Your auto-pay did not go through",
        greeting: greet(c),
        bodyHtml: p(`We could not take this month's payment for the <strong>${escapeHtml(text(v, "planName"))}</strong> plan of <strong>${escapeHtml(c.businessName)}</strong>. Razorpay will try again over the next few days, and everything keeps working meanwhile.`) + p("If your card or bank mandate has changed, you can set up auto-pay again now."),
        cta: { label: "Set up auto-pay again", url: `${c.productUrl}/subscribe` },
      }),
    }),
    whatsapp: { name: "platterly_autopay_failed", body: "Hi {{1}}, we could not take the auto-pay for your {{2}} plan. Razorpay will try again over the next few days, and everything keeps working meanwhile. To fix it now, set up auto-pay again here: {{3}} Thank you.", params: (v, c) => [c.businessName, text(v, "planName"), `${c.productUrl}/subscribe`] },
  },
  autopay_upcoming: {
    requires: ["planName", "amount", "chargeOn"],
    render: (v, c) => ({
      subject: `Your Platterly plan renews on ${text(v, "chargeOn")}`,
      html: renderEmail({
        tag: "Payment",
        eyebrow: "Auto-pay coming up",
        title: `We will charge ${inr(text(v, "amount"))} on ${escapeHtml(text(v, "chargeOn"))}`,
        greeting: greet(c),
        bodyHtml: p(`The <strong>${escapeHtml(text(v, "planName"))}</strong> plan for <strong>${escapeHtml(c.businessName)}</strong> renews on <strong>${escapeHtml(text(v, "chargeOn"))}</strong>. We will charge <strong>${inr(text(v, "amount"))}</strong> (with GST) through your auto-pay, so there is nothing you need to do.`),
        details: [["Plan", text(v, "planName")], ["Amount (with GST)", inr(text(v, "amount"))], ["Charge date", text(v, "chargeOn")]],
        cta: { label: "View subscription", url: `${c.productUrl}/settings/subscription` },
      }),
    }),
    whatsapp: { name: "platterly_autopay_upcoming", body: "Hi {{1}}, your {{2}} plan renews on {{3}}. We will charge {{4}} through your auto-pay, so there is nothing you need to do. To change or pause it, open Settings > Subscription in Platterly.", params: (v, c) => [c.businessName, text(v, "planName"), text(v, "chargeOn"), inr(text(v, "amount"))] },
  },
  autopay_today: {
    requires: ["planName", "amount"],
    render: (v, c) => ({
      subject: "Your Platterly plan renews today",
      html: renderEmail({
        tag: "Payment",
        eyebrow: "Auto-pay today",
        title: `We will charge ${inr(text(v, "amount"))} today`,
        greeting: greet(c),
        bodyHtml: p(`The <strong>${escapeHtml(text(v, "planName"))}</strong> plan for <strong>${escapeHtml(c.businessName)}</strong> renews today. We will charge <strong>${inr(text(v, "amount"))}</strong> (with GST) through your auto-pay and send you a confirmation once it goes through.`),
        cta: { label: "View subscription", url: `${c.productUrl}/settings/subscription` },
      }),
    }),
    whatsapp: { name: "platterly_autopay_today", body: "Hi {{1}}, your {{2}} plan renews today. We will charge {{3}} through your auto-pay and send you a confirmation once it goes through.", params: (v, c) => [c.businessName, text(v, "planName"), inr(text(v, "amount"))] },
  },
  autopay_stopped: {
    requires: ["planName"],
    render: (v, c) => ({
      subject: "Your Platterly auto-pay has stopped",
      html: renderEmail({
        tag: "Payment",
        eyebrow: "Auto-pay stopped",
        title: "Please set up auto-pay again",
        greeting: greet(c),
        bodyHtml: p(`Razorpay could not take the payment for the <strong>${escapeHtml(text(v, "planName"))}</strong> plan of <strong>${escapeHtml(c.businessName)}</strong> after several tries, so auto-pay has stopped. Set it up again to keep your account open.`),
        cta: { label: "Set up auto-pay again", url: `${c.productUrl}/subscribe` },
      }),
    }),
  },
  autopay_paused: {
    requires: ["planName"],
    render: (v, c) => ({
      subject: "Your Platterly subscription is paused",
      html: renderEmail({
        tag: "Plan",
        eyebrow: "Subscription paused",
        title: "No more charges until you resume",
        greeting: greet(c),
        bodyHtml: p(`The <strong>${escapeHtml(text(v, "planName"))}</strong> plan of <strong>${escapeHtml(c.businessName)}</strong> is paused. Everything keeps working until the end of the period you have paid for. Resume at any time to carry on.`),
        cta: { label: "Resume", url: `${c.productUrl}/settings/subscription` },
      }),
    }),
  },
  autopay_resumed: {
    requires: ["planName"],
    render: (v, c) => ({
      subject: "Your Platterly subscription is back on",
      html: renderEmail({
        tag: "Plan",
        eyebrow: "Subscription resumed",
        title: "Auto-pay is on again",
        greeting: greet(c),
        bodyHtml: p(`Auto-pay for the <strong>${escapeHtml(text(v, "planName"))}</strong> plan of <strong>${escapeHtml(c.businessName)}</strong> is on again.`),
        cta: { label: "View subscription", url: `${c.productUrl}/settings/subscription` },
      }),
    }),
  },
  downgrade_approval: {
    requires: ["planName", "newPlanName"],
    render: (v, c) => ({
      subject: `Approve auto-pay for ${text(v, "newPlanName")}`,
      html: renderEmail({
        tag: "Plan",
        eyebrow: "Plan change",
        title: `One step to move to ${escapeHtml(text(v, "newPlanName"))}`,
        greeting: greet(c),
        bodyHtml: p(`Your <strong>${escapeHtml(text(v, "planName"))}</strong> period has ended. To move <strong>${escapeHtml(c.businessName)}</strong> to <strong>${escapeHtml(text(v, "newPlanName"))}</strong>, approve its auto-pay. Your account keeps working for 7 days meanwhile.`),
        cta: { label: "Approve auto-pay", url: `${c.productUrl}/subscribe` },
      }),
    }),
  },
};

export function hasTemplate(key: string): boolean {
  return Object.hasOwn(TEMPLATES, key);
}

/** Renders a template, or returns the reason it cannot be (unknown key, missing variable). */
export function renderTemplate(key: string, variables: Variables, context: MessageContext): { ok: true; value: Rendered } | { ok: false; error: string } {
  if (!hasTemplate(key)) return { ok: false, error: `unknown template "${key}"` };
  const template = TEMPLATES[key];
  const missing = template.requires.filter((name) => variables[name] === undefined || variables[name] === "");
  if (missing.length > 0) return { ok: false, error: `template "${key}" needs ${missing.join(", ")}` };
  if (template.requires.includes("daysLeft") && !Number.isFinite(Number(variables.daysLeft))) return { ok: false, error: `template "${key}" needs daysLeft as a number` };
  return { ok: true, value: template.render(variables, context) };
}

/** The WhatsApp version of a template: the Meta template name, its {{n}} parameters, and the same words as plain text. Null when the template has none. */
export function whatsappMessage(key: string, v: Variables, c: MessageContext): { name: string; params: string[]; text: string } | null {
  const wa = hasTemplate(key) ? TEMPLATES[key].whatsapp : undefined;
  if (!wa) return null;
  const params = cleanParams(wa.params(v, c));
  return { name: wa.name, params, text: wa.body.replace(/\{\{(\d+)\}\}/g, (_, n: string) => params[Number(n) - 1] ?? "-") };
}
