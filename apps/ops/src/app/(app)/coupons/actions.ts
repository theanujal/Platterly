"use server";

import { revalidatePath } from "next/cache";
import type { CouponKind } from "@/generated/prisma/client";
import { requireStaff } from "@/lib/session";
import { BillingError } from "@/modules/billing/billing-error";
import { createCoupon, setCouponActive } from "@/modules/billing/coupons";

export interface CouponFormState {
  error?: string;
  saved?: string;
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

export async function createCouponAction(_prev: CouponFormState, formData: FormData): Promise<CouponFormState> {
  const staff = await requireStaff();
  const expires = text(formData, "expiresAt");
  const maxUses = text(formData, "maxUses");
  try {
    const coupon = await createCoupon(
      {
        code: text(formData, "code"),
        kind: (text(formData, "kind") === "FIXED" ? "FIXED" : "PERCENT") as CouponKind,
        value: Number(text(formData, "value")),
        // The last day it can be used: it runs to the end of that day (India time).
        expiresAt: expires ? new Date(`${expires}T23:59:59+05:30`) : null,
        maxUses: maxUses ? Number(maxUses) : null,
        productKey: text(formData, "productKey") || null,
        note: text(formData, "note"),
      },
      staff.id,
    );
    revalidatePath("/coupons");
    return { saved: coupon.code };
  } catch (error) {
    if (error instanceof BillingError) return { error: error.message };
    throw error;
  }
}

export async function setCouponActiveAction(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  await setCouponActive(text(formData, "code"), text(formData, "active") === "true", staff.id);
  revalidatePath("/coupons");
}
