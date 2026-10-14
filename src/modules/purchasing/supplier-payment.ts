import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { checkMoney, checkText } from "@/lib/validation";
import type { PaymentMethod } from "@/generated/prisma/enums";
import { outstandingBalance } from "./po-math";

export class SupplierPaymentError extends Error {}

export interface SupplierPaymentInput {
  amount: number;
  paidAt: Date;
  method?: PaymentMethod | null;
  note?: string | null;
}

export async function recordSupplierPayment(organizationId: string, supplierId: string, input: SupplierPaymentInput, actorUserId: string) {
  checkText(input.note, "note", 500);
  checkMoney(input.amount, "amount");
  const amount = Math.round((input.amount + Number.EPSILON) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) throw new SupplierPaymentError("Enter an amount greater than zero.");
  if (Number.isNaN(input.paidAt.getTime())) throw new SupplierPaymentError("Enter the date paid.");
  await prisma.supplier.findFirstOrThrow({ where: { id: supplierId, organizationId }, select: { id: true } });
  const payment = await prisma.supplierPayment.create({
    data: { organizationId, supplierId, amount, paidAt: input.paidAt, method: input.method ?? null, note: input.note?.trim() || null, recordedByUserId: actorUserId },
  });
  await audit({ organizationId, actorUserId, action: "supplier_payment.create", recordType: "SupplierPayment", recordId: payment.id, after: { supplierId, amount } });
  return payment;
}

export async function deleteSupplierPayment(organizationId: string, id: string, actorUserId: string) {
  const before = await prisma.supplierPayment.findFirstOrThrow({ where: { id, organizationId } });
  await prisma.supplierPayment.delete({ where: { id } });
  await audit({ organizationId, actorUserId, action: "supplier_payment.delete", recordType: "SupplierPayment", recordId: id, before: { supplierId: before.supplierId, amount: Number(before.amount) } });
}

/** Value received on this supplier's orders, what was paid, and the difference (what we owe). */
export async function getSupplierBalance(organizationId: string, supplierId: string) {
  const [items, paid] = await Promise.all([
    prisma.purchaseOrderItem.findMany({
      where: { purchaseOrder: { organizationId, supplierId, status: { not: "CANCELLED" } } },
      select: { receivedQuantity: true, unitCost: true, receiptLines: { select: { quantity: true, unitCost: true } } },
    }),
    prisma.supplierPayment.aggregate({ where: { organizationId, supplierId }, _sum: { amount: true } }),
  ]);
  // What arrived is valued at the price actually paid on each receipt; stock received before receipts were recorded keeps the order line's own cost.
  let received = 0;
  for (const i of items) {
    const receiptQty = i.receiptLines.reduce((s, l) => s + Number(l.quantity), 0);
    const legacy = Math.max(0, Number(i.receivedQuantity) - receiptQty);
    received += i.receiptLines.reduce((s, l) => s + Number(l.quantity) * Number(l.unitCost), 0) + legacy * Number(i.unitCost);
  }
  received = Math.round((received + Number.EPSILON) * 100) / 100;
  const paidTotal = Number(paid._sum.amount ?? 0);
  return { received, paid: paidTotal, outstanding: outstandingBalance(received, paidTotal) };
}

export function listSupplierPayments(organizationId: string, supplierId: string) {
  return prisma.supplierPayment.findMany({ where: { organizationId, supplierId }, orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }], take: 50 });
}
