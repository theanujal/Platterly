"use server";

import { revalidatePath } from "next/cache";
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
    const { product, secrets } = await registerProduct({ key: String(formData.get("key") ?? ""), name: String(formData.get("name") ?? ""), baseUrl: String(formData.get("baseUrl") ?? ""), actorUserId: staff.id });
    revalidatePath("/products");
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
    revalidatePath(`/products/${key}`);
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
  revalidatePath(`/products/${key}`);
}

export async function refreshManifestAction(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const key = String(formData.get("key") ?? "");
  await refreshManifest(key, staff.id);
  revalidatePath(`/products/${key}`);
  revalidatePath("/products");
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
  revalidatePath(`/products/${key}`);
  revalidatePath("/products");
}
