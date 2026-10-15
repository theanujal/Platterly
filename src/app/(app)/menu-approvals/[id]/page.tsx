import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { assertKitchenAtMyLocation } from "@/modules/locations/active-location";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { getMenuSelection } from "@/modules/menu-approvals/menu-approval";

export const metadata: Metadata = {
  title: "Menu Approval — Caterly",
  robots: { index: false, follow: false },
};

export default async function MenuApprovalDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string }>;
}) {
  const { id } = await params;
  const { version } = await searchParams;
  const { organizationId, session } = await requireActiveOrganization();
  await requirePermission({ menus: ["approve"] }, organizationId);

  const menuSelection = await getMenuSelection(organizationId, id);
  if (!menuSelection?.event.orderId) notFound();
  await assertKitchenAtMyLocation(organizationId, session.user.id, menuSelection.event.assignedKitchenId);

  // Phase 4 of the Menu Approvals + Orders merge: the review lives on the order's Menu Approval tab now. This address keeps working
  // (bookmarks, old links) and lands there, with the version being viewed. The permission, business and location checks above run
  // first, so a person who may not see this approval is refused here exactly as before and learns nothing from a redirect.
  const versionQuery = version && /^\d+$/.test(version) ? `&version=${version}` : "";
  redirect(`/orders/${menuSelection.event.orderId}?tab=approval${versionQuery}`);
}
