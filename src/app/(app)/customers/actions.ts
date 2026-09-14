"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { createCustomer, updateCustomer, type CustomerInput } from "@/modules/customers/customer";

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
    addressLine1: stringField(formData, "addressLine1"),
    city: stringField(formData, "city"),
    state: stringField(formData, "state"),
    notes: stringField(formData, "notes"),
    isActive: formData.get("isActive") === "true",
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
