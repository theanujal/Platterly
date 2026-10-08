"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { NumberingError, setInvoicePrefix } from "@/modules/billing/numbering";
import { requireStaff } from "@/lib/session";
import { RegistryError, finishRotation, refreshManifest, registerProduct, rotateSecrets, updateProduct } from "@/modules/registry/products";

export interface SecretsReveal {
  error?: string;
  productKey?: string;
  secrets?: { outbound: string; inbound: string };
}

/** Registers a product and returns its two secrets once. They are never shown again. */
export async function registerProductAction(_prev: SecretsReveal, formData: FormData): Promise<SecretsReveal> {
  const staff = await requireStaff();
  try {
    const name = String(formData.get("name") ?? "");
    // The key is the product's short address-style id. Left blank it comes from the name ("Rivo Reviews" becomes "rivoreviews").
    const key = String(formData.get("key") ?? "").trim() || name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const { product, secrets } = await registerProduct({ key, name, baseUrl: String(formData.get("baseUrl") ?? ""), actorUserId: staff.id });
    revalidatePath("/settings/products");
    return { productKey: product.key, secrets };
  } catch (error) {
    if (error instanceof RegistryError) return { error: error.message };
    throw error;
  }
}

export async function rotateSecretsAction(_prev: SecretsReveal, formData: FormData): Promise<SecretsReveal> {
  const staff = await requireStaff();
  const key = String(formData.get("key") ?? "");
  try {
    const secrets = await rotateSecrets(key, staff.id);
    revalidatePath(`/settings/products/${key}`);
    return { productKey: key, secrets };
  } catch (error) {
    if (error instanceof RegistryError) return { error: error.message };
    throw error;
  }
}

export async function finishRotationAction(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const key = String(formData.get("key") ?? "");
  await finishRotation(key, staff.id);
  revalidatePath(`/settings/products/${key}`);
}

export async function refreshManifestAction(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const key = String(formData.get("key") ?? "");
  await refreshManifest(key, staff.id);
  revalidatePath(`/settings/products/${key}`);
  revalidatePath("/settings/products");
}

export async function updateProductAction(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const key = String(formData.get("key") ?? "");
  await updateProduct(key, {
    name: String(formData.get("name") ?? ""),
    baseUrl: String(formData.get("baseUrl") ?? ""),
    status: formData.get("status") === "DISABLED" ? "DISABLED" : "ACTIVE",
    actorUserId: staff.id,
  });
  revalidatePath(`/settings/products/${key}`);
  revalidatePath("/settings/products");
}

export async function setInvoicePrefixAction(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const key = String(formData.get("key") ?? "");
  try {
    await setInvoicePrefix(key, String(formData.get("invoicePrefix") ?? ""), staff.id);
  } catch (error) {
    if (!(error instanceof NumberingError)) throw error;
    redirect(`/settings/products/${key}?prefixError=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/settings/products/${key}`);
  revalidatePath("/billing");
}
