import { runWithEndpointContext, type AuthEndpointContext } from "@better-auth/core/context";
import type { SessionEnder } from "./session-store";

/**
 * The way the Account ends provider sessions (F4.2.3). The provider's back-channel logout (a signed logout token to every product that holds a token
 * for the session) is a database hook that only runs inside the provider's own request context, so a bare adapter call would end the session
 * silently and no product would be told. This runs the deletion inside that context, exactly as the provider's own sign-out route does.
 */
export async function providerSessionEnder(auth: { $context: Promise<{ internalAdapter: { deleteSession(token: string): Promise<unknown>; deleteSessions(tokens: string[]): Promise<unknown> } }> }): Promise<SessionEnder> {
  const context = await auth.$context;
  const endpoint = { context } as unknown as AuthEndpointContext;
  return {
    deleteSession: (token) => runWithEndpointContext(endpoint, () => context.internalAdapter.deleteSession(token)),
    deleteSessions: (tokens) => runWithEndpointContext(endpoint, () => context.internalAdapter.deleteSessions(tokens)),
  };
}
