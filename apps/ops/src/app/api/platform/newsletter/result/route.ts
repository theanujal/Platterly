import { handleNewsletterResult } from "@/modules/newsletter/newsletter";

export const dynamic = "force-dynamic";

/** POST: the Platform reports how many people it sent an issue to (or that a test went out). Signed with the platform-billing secret. */
export async function POST(request: Request) {
  return handleNewsletterResult(request);
}
