import { handlePlatformBillingPost } from "@/modules/platform-list/platform-checkout";

export const dynamic = "force-dynamic";

/** POST: the Store's `method-add-verify` call (a saved payment method). Signed by Platform with the platform-billing secret; the answer is signed by Ops. */
export async function POST(request: Request, { params }: { params: Promise<{ businessId: string; productKey: string }> }) {
  return handlePlatformBillingPost(request, { ...(await params), action: "method-add-verify" });
}
