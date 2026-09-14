"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { createEventType, updateEventType, deleteEventType, type EventTypeInput } from "@/modules/events/event-type";
import { uploadCatalogImage } from "@/lib/storage/catalog-image";

export type ActionResult = { ok: true } | { ok: false; error: string };

function toErrorResult(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

function stringField(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

async function buildInput(organizationId: string, formData: FormData, existingImage?: string): Promise<EventTypeInput> {
  const name = stringField(formData, "name");
  if (!name) throw new Error("Name is required.");

  let image = existingImage;
  const file = formData.get("image");
  if (file instanceof File && file.size > 0) {
    image = await uploadCatalogImage(organizationId, "event-types", file);
  }

  const minGuestsRaw = stringField(formData, "minGuests");
  const minGuests = minGuestsRaw ? Number.parseInt(minGuestsRaw, 10) : null;
  if (minGuestsRaw && Number.isNaN(minGuests)) throw new Error("Min guests must be a whole number.");

  return {
    name,
    description: stringField(formData, "description"),
    image,
    minGuests,
    isActive: formData.get("isActive") === "true",
    menuIds: formData.getAll("menuIds").filter((v): v is string => typeof v === "string"),
  };
}

export async function createEventTypeAction(formData: FormData): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ events: ["create"] }, organizationId);
  try {
    const input = await buildInput(organizationId, formData);
    await createEventType(organizationId, input, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/events");
  return { ok: true };
}

export async function updateEventTypeAction(
  id: string,
  existingImage: string | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ events: ["edit"] }, organizationId);
  try {
    const input = await buildInput(organizationId, formData, existingImage);
    await updateEventType(organizationId, id, input, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/events");
  revalidatePath(`/events/${id}`);
  return { ok: true };
}

export async function deleteEventTypeAction(id: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ events: ["delete"] }, organizationId);
  try {
    await deleteEventType(organizationId, id, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/events");
  return { ok: true };
}
