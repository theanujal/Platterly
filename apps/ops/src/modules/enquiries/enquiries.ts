import "server-only";
import type { EnquiryStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifySafely } from "@/modules/notifications/notifications";

/**
 * Leads from the marketing site (AJ, 2026-10-12: "Book a demo submits a lead"). The site's Talk to us (Book a demo) and Contact
 * us forms post here; staff follow up from Leads. The same checks the site's own forms make, repeated here because the site
 * is only a browser.
 */
export class EnquiryError extends Error {}

export const ENQUIRY_KINDS = ["talk", "contact"] as const;
export type EnquiryKind = (typeof ENQUIRY_KINDS)[number];

export interface EnquiryInput {
  kind: EnquiryKind;
  name: string;
  email: string;
  phone: string | null;
  businessType: string | null;
  subject: string | null;
  message: string | null;
  page: string | null;
  source: string | null;
}

const text = (value: unknown, max: number): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

/** Validates what the site sends. Throws an EnquiryError with a message a person can read. */
export function parseEnquiry(body: unknown): EnquiryInput {
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new EnquiryError("Please send the form as a JSON object.");
  const b = body as Record<string, unknown>;
  const kind = b.kind;
  if (kind !== "talk" && kind !== "contact") throw new EnquiryError("Unknown form.");
  const name = text(b.name, 200);
  if (!name || name.length < 2) throw new EnquiryError("Please enter your name.");
  const email = text(b.email, 200);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new EnquiryError("Please enter a valid email address.");
  const phone = text(b.phone, 40);
  if (phone) {
    const digits = phone.replace(/[^\d]/g, "");
    if (!/^[\d+\-()\s]+$/.test(phone) || digits.length < 8 || digits.length > 15) throw new EnquiryError("Please enter a valid phone number.");
  } else if (kind === "talk") {
    throw new EnquiryError("Please enter your phone number.");
  }
  const businessType = text(b.businessType, 120);
  if (kind === "talk" && !businessType) throw new EnquiryError("Please choose the kind of business you run.");
  const subject = text(b.subject, 200);
  const message = text(b.message, 4000);
  if (kind === "contact" && !subject) throw new EnquiryError("Please choose what this is about.");
  if (kind === "contact" && (message?.length ?? 0) < 10) throw new EnquiryError("Please tell us a little more.");
  return { kind, name, email, phone, businessType, subject, message, page: text(b.page, 300), source: text(b.source, 100) };
}

export async function createEnquiry(input: EnquiryInput) {
  const row = await prisma.enquiry.create({ data: input });
  const what = input.kind === "talk" ? "asked for a demo" : `wrote to us (${input.subject})`;
  // A new lead should reach staff quickly: a warning-level notification also emails STAFF_NOTIFY_EMAILS.
  await notifySafely({ kind: "lead.new", severity: "WARNING", title: input.kind === "talk" ? "New demo request" : "New message from the website", body: `${input.name} ${what}${input.phone ? `, ${input.phone}` : ""}.`, link: "/enquiries", dedupeKey: `lead:${row.id}` });
  return row;
}

export async function listEnquiries(filter: { status?: EnquiryStatus | "ALL"; kind?: EnquiryKind | "ALL" } = {}) {
  return prisma.enquiry.findMany({
    where: { ...(filter.status && filter.status !== "ALL" ? { status: filter.status } : {}), ...(filter.kind && filter.kind !== "ALL" ? { kind: filter.kind } : {}) },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
}

export async function countNewEnquiries(): Promise<number> {
  return prisma.enquiry.count({ where: { status: "NEW" } });
}

/** Staff moves a lead along (New, Contacted, Closed) and may leave a note. */
export async function updateEnquiry(id: string, input: { status: EnquiryStatus; note: string | null }, actorUserId: string | null) {
  const before = await prisma.enquiry.findUnique({ where: { id } });
  if (!before) throw new EnquiryError("That lead no longer exists.");
  const contactedAt = input.status === "NEW" ? null : (before.contactedAt ?? new Date());
  const row = await prisma.enquiry.update({ where: { id }, data: { status: input.status, note: input.note?.trim().slice(0, 2000) || null, contactedAt } });
  await audit({ actorUserId, action: "enquiry.updated", subject: id, detail: { from: before.status, to: input.status } });
  return row;
}
