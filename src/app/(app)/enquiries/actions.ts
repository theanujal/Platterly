"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { createEnquiry, updateEnquiry, deleteEnquiry, convertEnquiryToCustomer, type EnquiryInput } from "@/modules/enquiries/enquiry";
import type { EnquiryLeadSource, EnquiryStatus } from "@/generated/prisma/enums";

export type ActionResult = { ok: true } | { ok: false; error: string };

function toErrorResult(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

function stringField(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function dateField(formData: FormData, name: string): Date | undefined {
  const raw = stringField(formData, name);
  if (raw === undefined) return undefined;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function numberField(formData: FormData, name: string): number | undefined {
  const raw = stringField(formData, name);
  if (raw === undefined) return undefined;
  const parsed = Number.parseFloat(raw);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function buildInput(formData: FormData): EnquiryInput {
  const name = stringField(formData, "name");
  if (!name) throw new Error("Name is required.");
  const phone = stringField(formData, "phone");
  if (!phone) throw new Error("Phone number is required.");

  return {
    name,
    phone,
    leadSource: stringField(formData, "leadSource") as EnquiryLeadSource | undefined,
    status: stringField(formData, "status") as EnquiryStatus | undefined,
    eventTypeId: stringField(formData, "eventTypeId") ?? null,
    eventDate: dateField(formData, "eventDate") ?? null,
    guestCount: numberField(formData, "guestCount") ?? null,
    venue: stringField(formData, "venue"),
    requirements: stringField(formData, "requirements"),
    budget: numberField(formData, "budget") ?? null,
    preferredMenuId: stringField(formData, "preferredMenuId") ?? null,
    notes: stringField(formData, "notes"),
  };
}

export async function createEnquiryAction(formData: FormData): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ enquiries: ["create"] }, organizationId);
  try {
    const input = buildInput(formData);
    await createEnquiry(organizationId, input, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/enquiries");
  return { ok: true };
}

export async function updateEnquiryAction(id: string, formData: FormData): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ enquiries: ["edit"] }, organizationId);
  try {
    const input = buildInput(formData);
    await updateEnquiry(organizationId, id, input, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/enquiries");
  return { ok: true };
}

export async function deleteEnquiryAction(id: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ enquiries: ["delete"] }, organizationId);
  try {
    await deleteEnquiry(organizationId, id, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/enquiries");
  return { ok: true };
}

export async function convertEnquiryAction(id: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ enquiries: ["edit"], customers: ["create"] }, organizationId);
  try {
    await convertEnquiryToCustomer(organizationId, id, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/enquiries");
  revalidatePath("/customers");
  return { ok: true };
}
