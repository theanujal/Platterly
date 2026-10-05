import { escapeHtml, p, renderEmail } from "./layout";

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
