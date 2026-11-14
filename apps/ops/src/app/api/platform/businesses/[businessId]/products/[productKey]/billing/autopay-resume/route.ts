import { handlePlatformBillingPost } from "@/modules/platform-list/platform-checkout";

export const dynamic = "force-dynamic";

/** POST: the Account's `autopay-resume` call (auto-renewal). Signed by Platform with the platform-billing secret; the answer is signed by Ops. */
export async function POST(request: Request, { params }: { params: Promise<{ businessId: string; productKey: string }> }) {
  return handlePlatformBillingPost(request, { ...(await params), action: "autopay-resume" });
}
