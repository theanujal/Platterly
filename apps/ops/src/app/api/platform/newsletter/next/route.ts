import { handleNewsletterNext } from "@/modules/newsletter/newsletter";

export const dynamic = "force-dynamic";

/** POST: the Platform asks for the next newsletter issue that is due, and any "send me a test" requests. Signed with the platform-billing secret. */
export async function POST(request: Request) {
  return handleNewsletterNext(request);
}
