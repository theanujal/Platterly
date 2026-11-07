import { PLATFORM_CONTRACT_VERSION } from "@platterly/platform-contract";
import { CLIENT_ID, SCOPES, eventsUri, logoutUri, redirectUri, stubOrigin } from "@/lib/config";

/**
 * What a product tells Platform about itself so it can be registered (F6.1.1) and reached (F6.2.1). The shape is the stub's own proposal, not yet an
 * approved contract: the plan names a manifest but does not define its fields.
 */
export async function GET() {
  return Response.json(
    {
      contractVersion: PLATFORM_CONTRACT_VERSION,
      key: "stub",
      name: "Platterly stub product",
      baseUrl: stubOrigin(),
      oidc: { clientId: CLIENT_ID, tokenEndpointAuthMethod: "none", pkce: "S256", scopes: SCOPES, redirectUris: [redirectUri()], postLogoutRedirectUris: [`${stubOrigin()}/`], backchannelLogoutUri: logoutUri() },
      endpoints: { events: eventsUri(), backchannelLogout: logoutUri(), health: `${stubOrigin()}/api/health` },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
