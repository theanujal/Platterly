"use server";

import { addCustomerNote, updateCustomerNote, deleteCustomerNote } from "@/modules/customers/customer-notes";
import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { createCustomer, updateCustomer, updateCustomerNotes, deleteCustomer, type CustomerInput } from "@/modules/customers/customer";
import type { EnquiryLeadSource } from "@/generated/prisma/enums";

export type ActionResult = { ok: true } | { ok: false; error: string };

function toErrorResult(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

function stringField(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function buildInput(formData: FormData): CustomerInput {
  const name = stringField(formData, "name");
  if (!name) throw new Error("Name is required.");
  const phone = stringField(formData, "phone");
  if (!phone) throw new Error("Phone is required.");

  return {
    name,
    phone,
    email: stringField(formData, "email"),
    notes: stringField(formData, "notes"),
    isActive: formData.get("isActive") === "true",
    isEnquiry: formData.get("isEnquiry") === "true",
    leadSource: stringField(formData, "leadSource") as EnquiryLeadSource | undefined,
  };
}

export async function createCustomerAction(formData: FormData): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ customers: ["create"] }, organizationId);
  try {
    const input = buildInput(formData);
    await createCustomer(organizationId, input, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/customers");
  return { ok: true };
}

export async function updateCustomerAction(id: string, formData: FormData): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ customers: ["edit"] }, organizationId);
  try {
    const input = buildInput(formData);
    await updateCustomer(organizationId, id, input, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  return { ok: true };
}

export async function deleteCustomerAction(id: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ customers: ["delete"] }, organizationId);
  try {
    await deleteCustomer(organizationId, id, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/customers");
  return { ok: true };
}

export async function updateCustomerNotesAction(id: string, notes: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ customers: ["edit"] }, organizationId);
  try {
    await updateCustomerNotes(organizationId, id, notes, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath(`/customers/${id}`);
  return { ok: true };
}

export async function addCustomerNoteAction(customerId: string, body: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ customers: ["edit"] }, organizationId);
  try {
    await addCustomerNote(organizationId, customerId, body, { userId: session.user.id, name: session.user.name });
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath(`/customers/${customerId}`);
  return { ok: true };
}

export async function updateCustomerNoteAction(customerId: string, noteId: string, body: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ customers: ["edit"] }, organizationId);
  try {
    await updateCustomerNote(organizationId, noteId, body, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath(`/customers/${customerId}`);
  return { ok: true };
}

export async function deleteCustomerNoteAction(customerId: string, noteId: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ customers: ["edit"] }, organizationId);
  try {
    await deleteCustomerNote(organizationId, noteId, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath(`/customers/${customerId}`);
  return { ok: true };
}
