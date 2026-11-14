import { redirect } from "next/navigation";
import { hasPermission, requireActiveOrganization } from "@/lib/auth/require-session";
import { getEntitlements } from "@/modules/ops-link/entitlements";
import { storeManageUrl } from "@/lib/platform/config";

/**
 * Caterly has no billing pages (AJ, 2026-11-14): plans, payment, invoices and refunds live in the Platterly Store. Old links (emails, notices, bookmarks) still
 * arrive at /subscribe and /settings/subscription, so both go through here: the Business Admin is sent to the Store, anyone else to the "plan ended" screen when the
 * kitchen is locked, or back to the dashboard.
 */
export async function sendToBilling(): Promise<never> {
  const { organizationId } = await requireActiveOrganization({ allowLocked: true });
  if (await hasPermission({ tenant: ["edit"] }, organizationId)) redirect(storeManageUrl());
  const { locked } = await getEntitlements(organizationId);
  redirect(locked ? "/plan-ended" : "/dashboard");
}
