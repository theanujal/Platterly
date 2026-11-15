import { handleAccountDeletionOpen } from "@/modules/account-deletions/account-deletions";

export const dynamic = "force-dynamic";

/** POST: signed with the platform-billing secret (see modules/account-deletions). */
export async function POST(request: Request) {
  return handleAccountDeletionOpen(request);
}
