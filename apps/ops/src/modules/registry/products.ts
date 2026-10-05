import "server-only";
import { isProductKey, newId, parseManifest, signedHeaders, verifyRequest, type ProductManifest } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { derivePrefix } from "@/modules/billing/numbering";
import { audit } from "@/lib/audit";
import { decryptSecret, encryptSecret, newSigningSecret } from "@/lib/secret-box";
import type { Product } from "@/generated/prisma/client";

export class RegistryError extends Error {}

/** A product's base URL as stored: http(s), no trailing slash, no path beyond the origin. */
export function normalizeBaseUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new RegistryError("The base URL is not a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new RegistryError("The base URL must start with http:// or https://.");
  if (url.username || url.password) throw new RegistryError("The base URL must not contain a user name or password.");
  return url.origin;
}

export interface ProductSecrets {
  outbound: string;
  inbound: string;
}

/** Shown to the operator once, right after registering or rotating. They are stored encrypted and cannot be read again. */
export async function registerProduct(input: { key: string; name: string; baseUrl: string; actorUserId: string | null }): Promise<{ product: Product; secrets: ProductSecrets }> {
  const key = input.key.trim().toLowerCase();
  if (!isProductKey(key)) throw new RegistryError("The product key must be lowercase letters, digits or dashes, starting with a letter (2 to 32 characters).");
  const name = input.name.trim();
  if (!name) throw new RegistryError("The product name is required.");
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  if (await prisma.product.findUnique({ where: { key } })) throw new RegistryError(`A product with the key "${key}" is already registered.`);

  const secrets: ProductSecrets = { outbound: newSigningSecret(), inbound: newSigningSecret() };
  const taken = (await prisma.product.findMany({ where: { invoicePrefix: { not: null } }, select: { invoicePrefix: true } })).map((p) => p.invoicePrefix!);
  const product = await prisma.product.create({
    // Its own invoice prefix and running number from the start (billing/numbering.ts); the prefix can be changed on the product page.
    data: { key, name, baseUrl, outboundSecret: encryptSecret(secrets.outbound), inboundSecret: encryptSecret(secrets.inbound), invoicePrefix: derivePrefix(key, taken), invoiceCounter: { create: {} } },
  });
  await audit({ actorUserId: input.actorUserId, action: "product.registered", subject: key, detail: { baseUrl } });
  return { product, secrets };
}

/**
 * New secrets in both directions. The old ones stay valid (as `Previous`) until `finishRotation`, so the product can be
 * updated without a gap: ops signs with the new outbound secret, and accepts either inbound secret.
 */
export async function rotateSecrets(key: string, actorUserId: string | null): Promise<ProductSecrets> {
  const product = await prisma.product.findUnique({ where: { key } });
  if (!product) throw new RegistryError("Product not found.");
  const secrets: ProductSecrets = { outbound: newSigningSecret(), inbound: newSigningSecret() };
  await prisma.product.update({
    where: { key },
    data: {
      outboundSecretPrevious: product.outboundSecret,
      inboundSecretPrevious: product.inboundSecret,
      outboundSecret: encryptSecret(secrets.outbound),
      inboundSecret: encryptSecret(secrets.inbound),
      secretsRotatedAt: new Date(),
    },
  });
  await audit({ actorUserId, action: "product.secrets_rotated", subject: key });
  return secrets;
}

/** Drops the previous secrets once the product runs on the new ones. */
export async function finishRotation(key: string, actorUserId: string | null): Promise<void> {
  await prisma.product.update({ where: { key }, data: { outboundSecretPrevious: null, inboundSecretPrevious: null } });
  await audit({ actorUserId, action: "product.rotation_finished", subject: key });
}

/** The secrets ops needs at runtime: the one it signs with, and every one it accepts from the product. */
export function secretsOf(product: Pick<Product, "outboundSecret" | "inboundSecret" | "inboundSecretPrevious">): { sign: string; accept: string[] } {
  const accept = [decryptSecret(product.inboundSecret)];
  if (product.inboundSecretPrevious) accept.push(decryptSecret(product.inboundSecretPrevious));
  return { sign: decryptSecret(product.outboundSecret), accept };
}

export async function updateProduct(key: string, input: { name: string; baseUrl: string; status: "ACTIVE" | "DISABLED"; actorUserId: string | null }): Promise<void> {
  const name = input.name.trim();
  if (!name) throw new RegistryError("The product name is required.");
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  await prisma.product.update({ where: { key }, data: { name, baseUrl, status: input.status } });
  await audit({ actorUserId: input.actorUserId, action: "product.updated", subject: key, detail: { baseUrl, status: input.status } });
}

/**
 * Reads the product's manifest (GET {baseUrl}/api/ops/manifest), checks the product signed the reply, validates it
 * and stores it. A failure is stored on the row (so the page can show why) and returned, never thrown.
 */
export async function refreshManifest(key: string, actorUserId: string | null, fetchImpl: typeof fetch = fetch): Promise<{ ok: true; manifest: ProductManifest } | { ok: false; error: string }> {
  const product = await prisma.product.findUnique({ where: { key } });
  if (!product) return { ok: false, error: "Product not found." };

  const fail = async (error: string) => {
    await prisma.product.update({ where: { key }, data: { manifestError: error } });
    return { ok: false as const, error };
  };

  try {
    const secrets = secretsOf(product);
    const response = await fetchImpl(`${product.baseUrl}/api/ops/manifest`, {
      method: "GET",
      headers: signedHeaders(secrets.sign, newId("command"), ""),
      signal: AbortSignal.timeout(8000),
      redirect: "error",
    });
    if (!response.ok) return await fail(`The product answered ${response.status}.`);
    const text = await response.text();
    const verified = verifyRequest(secrets.accept, response.headers, text);
    if (!verified.ok) return await fail(`The manifest reply was not signed correctly (${verified.reason}).`);
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return await fail("The manifest reply was not JSON.");
    }
    const parsed = parseManifest(json);
    if (!parsed.ok) return await fail(`The manifest is invalid: ${parsed.error}.`);
    if (parsed.value.productKey !== key) return await fail(`The manifest is for "${parsed.value.productKey}", not "${key}".`);

    await prisma.product.update({
      where: { key },
      data: { manifest: parsed.value as never, manifestVersion: parsed.value.version, manifestFetchedAt: new Date(), manifestError: null },
    });
    await audit({ actorUserId, action: "product.manifest_refreshed", subject: key, detail: { version: parsed.value.version } });
    return { ok: true, manifest: parsed.value };
  } catch (error) {
    return await fail(error instanceof Error ? `Could not reach the product: ${error.message}` : "Could not reach the product.");
  }
}
