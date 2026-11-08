import "server-only";
import { newId, signedHeaders } from "@platterly/contract";
import { verifyPlatformRequest } from "@platterly/platform-contract";
import { platformLink, type PlatformLinkConfig } from "./config";

/** A signed answer, so the Platform can check the reply came from this product. */
export function signedAnswer(config: PlatformLinkConfig, body: unknown, status = 200): Response {
  const text = JSON.stringify(body);
  return new Response(text, { status, headers: signedHeaders(config.answerSecret, newId("command"), text) });
}

const MAX_BODY_BYTES = 64 * 1024;

/**
 * Both /api/platform/{commands,events} start here. Link not configured: 404. Not signed by the Platform for THIS route with a current secret: 401 and
 * nothing else. Only then is the body trusted. The signature covers the route, so a request signed for one route cannot be replayed against the other.
 */
export async function authorisePlatform(request: Request): Promise<{ config: PlatformLinkConfig; rawBody: string } | { response: Response }> {
  const config = platformLink();
  if (!config) return { response: new Response("Not found", { status: 404 }) };
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return { response: Response.json({ error: "body too large" }, { status: 413 }) };
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) return { response: Response.json({ error: "body too large" }, { status: 413 }) };
  const verified = verifyPlatformRequest(config.commandSecrets, request.headers, rawBody, request.method, request.url);
  if (!verified.ok) return { response: Response.json({ error: "unauthorized" }, { status: 401 }) };
  return { config, rawBody };
}
