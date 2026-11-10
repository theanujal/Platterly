import { handleAccountReviewStatus } from "@/modules/account-reviews/account-reviews";

export const dynamic = "force-dynamic";

/** POST {reviewId}: is the review still open or has staff cleared it? Signed with the platform-billing secret. */
export async function POST(request: Request) {
  return handleAccountReviewStatus(request);
}
