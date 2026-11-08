import { authorisePlatform, signedAnswer } from "@/modules/platform-link/respond";
import { handlePlatformCommand } from "@/modules/platform-link/commands";

export const dynamic = "force-dynamic";

/** POST: a signed command from the Platform (`organisation.link`). A repeated command id is answered, not run again. */
export async function POST(request: Request) {
  const auth = await authorisePlatform(request);
  if ("response" in auth) return auth.response;
  const reply = await handlePlatformCommand(auth.rawBody);
  return signedAnswer(auth.config, reply.body, reply.status);
}
