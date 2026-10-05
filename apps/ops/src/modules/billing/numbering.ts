import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";

/**
 * Invoice numbers follow the product: each product has its own prefix and its own running number, so catering's invoices
 * run FP...-1, -2, -3 whatever another product issues. The number is taken inside the transaction that confirms the
 * payment, so a payment that fails to confirm leaves no gap, and two payments at once get two different numbers.
 */
export class NumberingError extends Error {}

type Db = Prisma.TransactionClient | typeof prisma;

/** The next number for a product (highest issued + 1), taken atomically. */
export async function nextInvoiceNumber(db: Db, productKey: string): Promise<number> {
  const rows = await db.$queryRaw<{ lastNumber: number }[]>`
    insert into invoice_counter ("productKey", "lastNumber") values (${productKey}, 1)
    on conflict ("productKey") do update set "lastNumber" = invoice_counter."lastNumber" + 1
    returning "lastNumber"`;
  return rows[0].lastNumber;
}

/** The highest number issued so far for a product (0 when none). */
export async function lastInvoiceNumber(productKey: string): Promise<number> {
  return (await prisma.invoiceCounter.findUnique({ where: { productKey } }))?.lastNumber ?? 0;
}

const PREFIX = /^[A-Z0-9]{1,6}$/;

/** A starting prefix for a new product: the first letters of its key, made unique among the prefixes already taken. */
export function derivePrefix(productKey: string, taken: string[]): string {
  const base = productKey.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 3) || "P";
  const used = new Set(taken.map((t) => t.toUpperCase()));
  if (!used.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base.slice(0, 6 - String(n).length)}${n}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new NumberingError("Could not find a free invoice prefix.");
}

/** Sets a product's invoice prefix. Numbers already issued keep the prefix they were printed with. */
export async function setInvoicePrefix(productKey: string, input: string, actorUserId: string | null): Promise<string> {
  const prefix = input.trim().toUpperCase();
  if (!PREFIX.test(prefix)) throw new NumberingError("The invoice prefix is 1 to 6 letters or digits.");
  const clash = await prisma.product.findFirst({ where: { invoicePrefix: prefix, NOT: { key: productKey } }, select: { name: true } });
  if (clash) throw new NumberingError(`"${prefix}" is already the invoice prefix of ${clash.name}. Two products cannot share one.`);
  const before = await prisma.product.findUnique({ where: { key: productKey }, select: { invoicePrefix: true } });
  if (!before) throw new NumberingError("Product not found.");
  await prisma.product.update({ where: { key: productKey }, data: { invoicePrefix: prefix } });
  await audit({ actorUserId, action: "product.invoice_prefix_changed", subject: productKey, detail: { from: before.invoicePrefix, to: prefix } });
  return prefix;
}
