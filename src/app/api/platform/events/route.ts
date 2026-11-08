import { authorisePlatform, signedAnswer } from "@/modules/platform-link/respond";
import { handlePlatformEvent } from "@/modules/platform-link/events";

export const dynamic = "force-dynamic";

/** POST: a signed event from the Platform. 200 once recorded (or when it was a duplicate or older), so the sender stops retrying. */
export async function POST(request: Request) {
  const auth = await authorisePlatform(request);
  if ("response" in auth) return auth.response;
  const outcome = await handlePlatformEvent({ secrets: auth.config.commandSecrets, headers: request.headers, rawBody: auth.rawBody, method: request.method, url: request.url });
  return signedAnswer(auth.config, outcome.status === 200 ? { status: "ok", applied: outcome.applied } : { error: outcome.error }, outcome.status);
}
