import { handleBusinessBillingRequest } from "@/modules/platform-list/platform-plans";

export const dynamic = "force-dynamic";

/** GET: one business's subscriptions and payments for the Platform. Signed by the platform with its platform-reader secret; the answer is signed by Ops. */
export async function GET(request: Request, { params }: { params: Promise<{ businessId: string }> }) {
  return handleBusinessBillingRequest(request, (await params).businessId);
}
