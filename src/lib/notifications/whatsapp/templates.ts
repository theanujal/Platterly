/**
 * The seven WhatsApp messages Platterly sends, all to a kitchen's own team (AJ, 2026-10-09). Each is an approved
 * Meta template; the body here is the same wording, used as the plain-text fallback until the template is approved.
 * An event not listed here is never sent on WhatsApp.
 */
export interface WhatsAppTemplate {
  name: string;
  body: string;
}

export const WHATSAPP_TEMPLATES: Record<string, WhatsAppTemplate> = {
  "order.new_alert": { name: "platterly_new_order", body: "New order {{1}} from {{2}} for {{3}}. Open Platterly to review it." },
  "order.sent_to_kitchen": { name: "platterly_order_to_kitchen", body: "Order {{1}} for {{2}} ({{3}}) has been sent to the kitchen. Please check the stock it needs in Platterly." },
  "menu_approval.sent": { name: "platterly_menu_sent", body: "The menu for order {{1}} ({{2}}) was sent to the customer for approval, version {{3}}." },
  "menu_approval.approved": { name: "platterly_menu_approved", body: "{{1}} approved the menu for order {{2}}. Check the details in Platterly." },
  "payment.received": { name: "platterly_payment_received", body: "{{1}} paid {{2}} for order {{3}}." },
  "payment.overdue_digest": { name: "platterly_overdue_weekly", body: "Weekly payment reminder: {{1}} orders have overdue payments totalling {{2}}. Open Platterly to follow up." },
  "event.tomorrow_summary": { name: "platterly_events_tomorrow", body: "You have {{1}} event(s) to cater tomorrow: {{2}}. Check the details in Platterly." },
};

/** Meta rejects a variable with a line break, tab or long run of spaces, and an empty one. */
export function cleanParam(value: unknown): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  return text || "-";
}

export function cleanParams(values: unknown[]): string[] {
  return values.map(cleanParam);
}

export function renderTemplate(body: string, params: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, n: string) => params[Number(n) - 1] ?? "-");
}
