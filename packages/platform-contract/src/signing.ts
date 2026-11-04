import { requestTarget, signedHeaders, verifyRequest, type VerifyResult } from "../../contract/src/signing";

export { SIGNATURE_TOLERANCE_SECONDS } from "../../contract/src/version";

/**
 * This channel always uses the route-bound scheme of `packages/contract` (`v2`, 300 s window, constant-time compare,
 * two secrets valid during a rotation). A request cannot be signed or verified without saying where it is going, so a captured
 * request cannot be replayed against another route. One secret pair per product, separate from Ops' secrets.
 */
export function signPlatformRequest(secret: string, id: string, body: string, method: string, url: string | URL, now?: number): Record<string, string> {
  return signedHeaders(secret, id, body, { now, target: requestTarget(method, url) });
}

export function verifyPlatformRequest(secrets: readonly string[], headers: Headers | Record<string, string | string[] | undefined>, rawBody: string, method: string, url: string | URL, now?: number): VerifyResult {
  return verifyRequest(secrets, headers, rawBody, { now, target: requestTarget(method, url) });
}
