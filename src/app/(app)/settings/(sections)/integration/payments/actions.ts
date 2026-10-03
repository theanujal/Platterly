"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { audit } from "@/lib/audit/audit";
import {
  PaymentSettingsError,
  disconnectRazorpay,
  getRazorpayCredentials,
  saveAdvancePercent,
  saveRazorpay,
  saveUpi,
} from "@/modules/payments/payment-settings";
import { testRazorpayKeys } from "@/modules/payments/razorpay";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

async function guard() {
  const { organizationId, session } = await requireActiveOrganization();
  await requirePermission({ settings: ["edit"] }, organizationId);
  return { organizationId, userId: session.user.id };
}

async function run(fn: () => Promise<ActionResult | void>): Promise<ActionResult> {
  try {
    const result = await fn();
    revalidatePath("/settings/integration/payments");
    return result ?? { ok: true };
  } catch (error) {
    if (error instanceof PaymentSettingsError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function saveRazorpayAction(formData: FormData): Promise<ActionResult> {
  const { organizationId, userId } = await guard();
  return run(async () => {
    await saveRazorpay(organizationId, {
      keyId: String(formData.get("keyId") ?? ""),
      keySecret: String(formData.get("keySecret") ?? ""),
      webhookSecret: String(formData.get("webhookSecret") ?? ""),
    });
    // Only the fact that it changed is logged, never a key.
    await audit({ organizationId, actorUserId: userId, action: "payments.razorpay_saved", recordType: "TenantSetting", recordId: "payments.razorpay" });
  });
}

export async function testRazorpayAction(): Promise<ActionResult> {
  const { organizationId } = await guard();
  const creds = await getRazorpayCredentials(organizationId);
  if (!creds) return { ok: false, error: "Save your Razorpay keys first." };
  const ok = await testRazorpayKeys(creds).catch(() => false);
  return ok ? { ok: true, message: "Razorpay accepted your keys." } : { ok: false, error: "Razorpay did not accept these keys. Check the Key ID and Key Secret." };
}

export async function disconnectRazorpayAction(): Promise<ActionResult> {
  const { organizationId, userId } = await guard();
  return run(async () => {
    await disconnectRazorpay(organizationId);
    await audit({ organizationId, actorUserId: userId, action: "payments.razorpay_disconnected", recordType: "TenantSetting", recordId: "payments.razorpay" });
  });
}

export async function saveUpiAction(formData: FormData): Promise<ActionResult> {
  const { organizationId } = await guard();
  return run(() => saveUpi(organizationId, { upiId: String(formData.get("upiId") ?? ""), payeeName: String(formData.get("payeeName") ?? "") }));
}

export async function saveAdvanceAction(formData: FormData): Promise<ActionResult> {
  const { organizationId } = await guard();
  return run(() => saveAdvancePercent(organizationId, Number(formData.get("advancePercent"))));
}
