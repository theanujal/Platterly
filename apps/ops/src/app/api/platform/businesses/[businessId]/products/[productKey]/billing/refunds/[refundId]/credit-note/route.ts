import { handlePlatformCreditNoteRequest } from "@/modules/platform-list/platform-plans";

export const dynamic = "force-dynamic";

/** GET: one credit note as a PDF for the Platform. Signed by the platform with the platform-reader secret; the answer is signed by Ops. */
export async function GET(request: Request, { params }: { params: Promise<{ businessId: string; productKey: string; refundId: string }> }) {
  return handlePlatformCreditNoteRequest(request, await params);
}
