"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { createEvent, updateEvent, deleteEvent, type EventInput, type RequiredInventoryInput } from "@/modules/events/event";
import type { EventStatus } from "@/generated/prisma/enums";

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

function buildRequiredInventory(formData: FormData): RequiredInventoryInput[] {
  const ids = formData.getAll("requiredInventoryId").filter((v): v is string => typeof v === "string");
  const quantities = formData.getAll("requiredInventoryQuantity").filter((v): v is string => typeof v === "string");
  return ids.map((inventoryId, index) => ({
    inventoryId,
    quantity: Number.parseFloat(quantities[index] ?? "0") || 0,
  }));
}

function buildInput(formData: FormData): EventInput {
  const customerId = stringField(formData, "customerId");
  if (!customerId) throw new Error("A Customer is required.");
  const eventTypeId = stringField(formData, "eventTypeId");
  if (!eventTypeId) throw new Error("An Event Type is required.");
  const name = stringField(formData, "name");
  if (!name) throw new Error("Event Name is required.");
  const startDate = dateField(formData, "startDate");
  if (!startDate) throw new Error("A valid Start Date is required.");
  const endDate = dateField(formData, "endDate");
  if (!endDate) throw new Error("A valid End Date is required.");
  if (endDate < startDate) throw new Error("End Date can't be before Start Date.");

  const guestCountRaw = stringField(formData, "guestCount");
  const guestCount = guestCountRaw ? Number.parseInt(guestCountRaw, 10) : null;
  if (guestCountRaw && Number.isNaN(guestCount)) throw new Error("Guest Count must be a whole number.");

  const status = stringField(formData, "status") as EventStatus | undefined;

  return {
    customerId,
    eventTypeId,
    assignedKitchenId: stringField(formData, "assignedKitchenId") ?? null,
    name,
    startDate,
    endDate,
    venue: stringField(formData, "venue"),
    guestCount,
    notes: stringField(formData, "notes"),
    status,
    requiredInventory: buildRequiredInventory(formData),
  };
}

export async function createEventAction(formData: FormData): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ events: ["create"] }, organizationId);
  try {
    const input = buildInput(formData);
    await createEvent(organizationId, input, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/events");
  return { ok: true };
}

export async function updateEventAction(id: string, formData: FormData): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ events: ["edit"] }, organizationId);
  try {
    const input = buildInput(formData);
    await updateEvent(organizationId, id, input, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/events");
  revalidatePath(`/events/${id}`);
  return { ok: true };
}

export async function deleteEventAction(id: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ events: ["delete"] }, organizationId);
  try {
    await deleteEvent(organizationId, id, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/events");
  return { ok: true };
}
