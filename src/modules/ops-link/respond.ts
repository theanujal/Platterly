import "server-only";
import { newId, signedHeaders, verifyRequest, CONTRACT_VERSION } from "@platterly/contract";
import { opsLink, type OpsLinkConfig } from "./config";

/** A signed answer: ops checks the reply really came from this product (same headers as an event). */
export function signedJson(config: OpsLinkConfig, body: unknown, status = 200): Response {
  const text = JSON.stringify(body);
  return new Response(text, { status, headers: signedHeaders(config.eventSecret, newId("command"), text) });
}

const NOT_FOUND = () => new Response("Not found", { status: 404 });
const UNAUTHORIZED = () => Response.json({ error: "unauthorized" }, { status: 401 });

/**
 * Every /api/ops/* route starts here. The link switched off answers 404 (as if the route did not exist). A request that
 * is not signed by ops with a current command secret answers 401 and nothing else. Only then is the body trusted.
 */
export async function authoriseOps(request: Request): Promise<{ config: OpsLinkConfig; rawBody: string } | { response: Response }> {
  const config = opsLink();
  if (!config) return { response: NOT_FOUND() };
  const rawBody = request.method === "GET" || request.method === "HEAD" ? "" : await request.text();
  const verified = verifyRequest(config.commandSecrets, request.headers, rawBody);
  if (!verified.ok) return { response: UNAUTHORIZED() };
  if (verified.contract > CONTRACT_VERSION) return { response: Response.json({ error: `contract ${verified.contract} is not supported` }, { status: 400 }) };
  return { config, rawBody };
}
