"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/session";
import { LifecycleError, createBusiness, deleteBusiness, reactivateBusiness, restoreBusiness, setProvider, suspendBusiness, updateBusiness, type CommandResult } from "@/modules/lifecycle/lifecycle";

export interface BusinessFormState {
  error?: string;
  saved?: string;
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "");

/** One answer for every action: refused (with the product's reason), done, or saved and waiting for the product to be reachable. */
function answer(result: CommandResult, businessId: string): BusinessFormState {
  if (!result.ok) return { error: result.error };
  revalidatePath(`/businesses/${businessId}`);
  revalidatePath("/businesses");
  return { saved: result.delivered ? "Done." : "Saved. The product could not be reached just now, so this is queued and will be retried." };
}

async function guarded(businessId: string, run: () => Promise<CommandResult>): Promise<BusinessFormState> {
  try {
    return answer(await run(), businessId);
  } catch (error) {
    if (error instanceof LifecycleError) return { error: error.message };
    throw error;
  }
}

export async function createBusinessAction(_prev: BusinessFormState, formData: FormData): Promise<BusinessFormState> {
  const staff = await requireStaff();
  let businessId: string;
  try {
    ({ businessId } = await createBusiness({ productKey: text(formData, "productKey"), name: text(formData, "name"), ownerName: text(formData, "ownerName"), ownerEmail: text(formData, "ownerEmail") }, staff.id));
  } catch (error) {
    if (error instanceof LifecycleError) return { error: error.message };
    throw error;
  }
  revalidatePath("/businesses");
  redirect(`/businesses/${businessId}`);
}

export async function updateBusinessAction(_prev: BusinessFormState, formData: FormData): Promise<BusinessFormState> {
  const staff = await requireStaff();
  const id = text(formData, "businessId");
  return guarded(id, () => updateBusiness(id, text(formData, "productKey"), { name: text(formData, "name"), ownerName: text(formData, "ownerName"), ownerEmail: text(formData, "ownerEmail"), contactPhone: text(formData, "contactPhone"), slug: text(formData, "slug") }, staff.id));
}

export async function suspendBusinessAction(_prev: BusinessFormState, formData: FormData): Promise<BusinessFormState> {
  const staff = await requireStaff();
  const id = text(formData, "businessId");
  return guarded(id, () => suspendBusiness(id, text(formData, "productKey"), text(formData, "reason"), staff.id));
}

export async function reactivateBusinessAction(_prev: BusinessFormState, formData: FormData): Promise<BusinessFormState> {
  const staff = await requireStaff();
  const id = text(formData, "businessId");
  return guarded(id, () => reactivateBusiness(id, text(formData, "productKey"), staff.id));
}

export async function deleteBusinessAction(_prev: BusinessFormState, formData: FormData): Promise<BusinessFormState> {
  const staff = await requireStaff();
  const id = text(formData, "businessId");
  return guarded(id, () => deleteBusiness(id, text(formData, "productKey"), text(formData, "confirmation"), staff.id));
}

export async function restoreBusinessAction(_prev: BusinessFormState, formData: FormData): Promise<BusinessFormState> {
  const staff = await requireStaff();
  const id = text(formData, "businessId");
  return guarded(id, () => restoreBusiness(id, text(formData, "productKey"), staff.id));
}

export async function providerAction(_prev: BusinessFormState, formData: FormData): Promise<BusinessFormState> {
  const staff = await requireStaff();
  const id = text(formData, "businessId");
  const channel = text(formData, "channel");
  if (channel !== "whatsapp" && channel !== "email") return { error: "Unknown channel." };
  return guarded(id, () => setProvider(id, text(formData, "productKey"), channel, text(formData, "connected") === "1", staff.id));
}
