// The stub product's settings. Everything comes from the environment, with local defaults that match Platform's hosts and ports (D14).
export const CLIENT_ID = "stub-product";
export const SCOPES = ["openid", "email", "profile"];
export const SESSION_COOKIE = "stub_session";
export const TX_COOKIE = "stub_oidc_tx";
export const SESSION_SECONDS = 7 * 24 * 3600;
export const TX_SECONDS = 600;

export const stubOrigin = () => process.env.STUB_ORIGIN ?? "http://stub.localhost:3500";
export const authOrigin = () => process.env.PLATFORM_AUTH_ORIGIN ?? "http://auth.localhost:3300";
export const issuer = () => `${authOrigin()}/api/auth`;
export const redirectUri = () => `${stubOrigin()}/auth/callback`;
export const logoutUri = () => `${stubOrigin()}/api/platform/logout`;
export const eventsUri = () => `${stubOrigin()}/api/platform/events`;

/** Secrets that sign Platform -> stub event deliveries. Two are valid during a rotation. */
export const eventSecrets = () => (process.env.STUB_EVENT_SECRETS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export function sessionSecret(): string {
  const secret = process.env.STUB_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("STUB_SESSION_SECRET must be set (32+ characters)");
  return secret;
}
