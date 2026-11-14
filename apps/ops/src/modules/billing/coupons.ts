import "server-only";
import type { CouponKind } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { BillingError } from "./billing-error";

/**
 * Coupons (AJ, 2026-11-14): percent or fixed rupees off the amount BEFORE GST, one per order, on the first payment of a purchase only (a renewal charges the full
 * price). The discount is worked out here from Ops's own records; nothing about money comes from the caller.
 */

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** The code as staff store it and customers type it: trimmed, spaces removed, capitals. */
export const normalizeCode = (code: string) => code.replace(/\s+/g, "").toUpperCase();

/** The rupees a coupon takes off `amount` (before GST): never more than the amount, so the price never goes below zero. */
export function applyCoupon(coupon: { kind: CouponKind; value: number }, amount: number): number {
  if (amount <= 0) return 0;
  const raw = coupon.kind === "PERCENT" ? (amount * coupon.value) / 100 : coupon.value;
  return Math.min(round2(raw), round2(amount));
}

export interface NewCoupon {
  code: string;
  kind: CouponKind;
  value: number;
  expiresAt?: Date | null;
  maxUses?: number | null;
  productKey?: string | null;
  note?: string | null;
}

export async function createCoupon(input: NewCoupon, actorUserId: string | null = null) {
  const code = normalizeCode(input.code);
  if (!code) throw new BillingError("Enter a coupon code.");
  if (code.length > 32) throw new BillingError("A coupon code can be at most 32 characters.");
  if (input.kind === "PERCENT" && !(input.value >= 1 && input.value <= 100)) throw new BillingError("A percentage coupon must be between 1 and 100.");
  if (input.kind === "FIXED" && !(input.value > 0)) throw new BillingError("A fixed coupon must take off more than zero rupees.");
  if (input.maxUses != null && !(Number.isInteger(input.maxUses) && input.maxUses >= 1)) throw new BillingError("Maximum uses must be a whole number of at least 1.");
  if (await prisma.coupon.findUnique({ where: { code } })) throw new BillingError("A coupon with this code already exists.");
  const coupon = await prisma.coupon.create({ data: { code, kind: input.kind, value: round2(input.value), expiresAt: input.expiresAt ?? null, maxUses: input.maxUses ?? null, productKey: input.productKey ?? null, note: input.note?.trim() || null } });
  await audit({ actorUserId, action: "coupon.created", subject: coupon.id, detail: { code, kind: input.kind, value: input.value, maxUses: input.maxUses ?? null, productKey: input.productKey ?? null } });
  return coupon;
}

export async function setCouponActive(code: string, active: boolean, actorUserId: string | null = null) {
  const found = await prisma.coupon.findUnique({ where: { code: normalizeCode(code) } });
  if (!found) throw new BillingError("That coupon code is not valid.");
  const coupon = await prisma.coupon.update({ where: { id: found.id }, data: { active } });
  await audit({ actorUserId, action: active ? "coupon.resumed" : "coupon.paused", subject: coupon.id, detail: { code: coupon.code } });
  return coupon;
}

/**
 * The coupon behind a typed code, or a plain reason why it cannot be used. A paused coupon reads as "not valid" (the same as an unknown one). `maxUses` counts PAID
 * payments, so a payment that was started and never finished does not use a coupon up. A business can use one code once: it is a first-payment offer.
 */
export async function findUsableCoupon(input: { code: string; productKey: string; businessId: string; now: Date }) {
  const coupon = await prisma.coupon.findUnique({ where: { code: normalizeCode(input.code) } });
  if (!coupon || !coupon.active) throw new BillingError("That coupon code is not valid.");
  if (coupon.expiresAt && coupon.expiresAt <= input.now) throw new BillingError("This coupon has expired.");
  if (coupon.productKey && coupon.productKey !== input.productKey) throw new BillingError("This coupon is not for this product.");
  if (coupon.maxUses != null && (await prisma.subscriptionPayment.count({ where: { couponId: coupon.id, status: "PAID" } })) >= coupon.maxUses) throw new BillingError("This coupon has been used up.");
  if ((await prisma.subscriptionPayment.count({ where: { couponId: coupon.id, businessId: input.businessId, status: "PAID" } })) > 0) throw new BillingError("You have already used this coupon.");
  return coupon;
}
