import { handleAccountReviewOpen } from "@/modules/account-reviews/account-reviews";

export const dynamic = "force-dynamic";

/** POST: the Platform opens a review (an email change was cancelled by the old address). Signed with the platform-billing secret. */
export async function POST(request: Request) {
  return handleAccountReviewOpen(request);
}
