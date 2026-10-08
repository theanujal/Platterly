import type { Release } from "@/content/types";

/**
 * What has shipped in Catering by Platterly, newest first. Written from the product's own build history: only things that
 * exist. (Platterly Ops will manage this list later.)
 */
export const RELEASES: Release[] = [
  { id: "2026-10-04-notifications", date: "2026-10-04", title: "Notifications that reach the right person", body: "Email, an in-app bell and optional device alerts now tell the right team member about new orders, approvals and reminders. Each person has one master switch.", kind: "new", product: "catering" },
  { id: "2026-10-04-reports", date: "2026-10-04", title: "Sales and events reports, and an audit log", body: "See how orders and events are doing over any period, and review who changed what and when in a new Audit Log. Password reset now works with a one-time code sent by email.", kind: "new", product: "catering" },
  { id: "2026-10-04-kitchen-supply", date: "2026-10-04", title: "Recipes, suppliers and purchasing", body: "Build recipes, keep supplier details, raise purchase orders and plan what the kitchen needs to produce for the week.", kind: "new", product: "catering" },
  { id: "2026-10-04-staff", date: "2026-10-04", title: "Staff, event staffing and logistics", body: "Record your team, say how many people each event needs for every duty, assign tasks, and keep vehicle, driver and dispatch details beside the order.", kind: "new", product: "catering" },
  { id: "2026-10-04-plans", date: "2026-10-04", title: "Paid plans with GST invoices", body: "Move from the free trial to a paid plan online. Every payment comes with a GST invoice, and the plan comes with unlimited customers, events and orders.", kind: "new", product: "catering" },
  { id: "2026-10-03-billing", date: "2026-10-03", title: "Invoices and payments with your own Razorpay and UPI", body: "Each kitchen connects its own Razorpay and UPI details. Customers pay you directly, and every order shows what is paid and what is left.", kind: "new", product: "catering" },
  { id: "2026-10-03-expenses", date: "2026-10-03", title: "Expenses and profitability", body: "Record order expenses and company expenses, and see what each event actually earned.", kind: "new", product: "catering" },
  { id: "2026-10-02-access", date: "2026-10-02", title: "Roles that decide what each person sees", body: "The sidebar and the dashboard now follow the role: sales, kitchen, store, accounts and event team each see their own work.", kind: "improved", product: "catering" },
  { id: "2026-09-30-team", date: "2026-09-30", title: "Team management, rebuilt", body: "Four tabs for people, roles and invitations, 48-hour invitation links and a team-member limit that follows your plan.", kind: "improved", product: "catering" },
  { id: "2026-09-27-orders", date: "2026-09-27", title: "A faster way to create and manage orders", body: "One form for the whole order with automatic multi-day events, a food item drawer, an individual pricing switch, and a clearer order page with a status sidebar.", kind: "improved", product: "catering" },
  { id: "2026-09-26-calendar", date: "2026-09-26", title: "Calendar and a menu approval link per version", body: "A calendar shows how busy every day is. Each version of a menu now has its own no-login link, so your customer approves exactly what you sent.", kind: "new", product: "catering" },
];
