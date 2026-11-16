import { handleAccountDeletionErased } from "@/modules/account-deletions/account-deletions";

export const dynamic = "force-dynamic";

/** POST: signed with the platform-billing secret (see modules/account-deletions). The Platform reports the person is erased. */
export async function POST(request: Request) {
  return handleAccountDeletionErased(request);
}
