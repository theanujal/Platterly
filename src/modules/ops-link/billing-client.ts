import "server-only";
import { newId, signedHeaders, verifyRequest } from "@platterly/contract";
import { ValidationError } from "@/lib/errors";
import { opsLink } from "./config";

/**
 * The product side of the billing API (docs/ops-contract.md section 8.1): catering asks Platterly Ops for plans, a business's
 * subscription and payments, a checkout, a verification, a downgrade and an invoice. Every request is signed with the event
 * secret; every answer must be signed by ops (checked with the command secrets) or it is refused, so a stranger answering on
 * ops's address can never feed a kitchen a fake price or a fake receipt.
 */
export class OpsUnavailableError extends Error {
  constructor(message = "Billing could not be reached.") {
    super(message);
    this.name = "OpsUnavailableError";
  }
}

const TIMEOUT_MS = 10_000;

export interface OpsReply<T> {
  status: number;
  json: T;
}

export async function opsBilling<T = unknown>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown, fetchImpl: typeof fetch = fetch): Promise<OpsReply<T>> {
  const config = opsLink();
  if (!config) throw new OpsUnavailableError();
  const text = body === undefined ? "" : JSON.stringify(body);
  let response: Response;
  let raw: string;
  try {
    response = await fetchImpl(`${config.baseUrl}/api/products/${config.productKey}${path}`, {
      method,
      headers: signedHeaders(config.eventSecret, newId("command"), text),
      body: text || undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "error",
      cache: "no-store",
    });
    raw = await response.text();
  } catch {
    throw new OpsUnavailableError();
  }
  // A reply that ops did not sign is treated as no reply at all.
  if (!verifyRequest(config.commandSecrets, response.headers, raw).ok) throw new OpsUnavailableError();
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new OpsUnavailableError();
  }
  return { status: response.status, json: json as T };
}

/** The same call, but anything other than 2xx becomes a message a person can read (ops writes its 4xx messages for people). */
export async function opsBillingOk<T = unknown>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown, fetchImpl: typeof fetch = fetch): Promise<T> {
  const { status, json } = await opsBilling<T & { error?: string }>(method, path, body, fetchImpl);
  if (status >= 200 && status < 300) return json;
  const error = (json as { error?: string })?.error;
  if (status === 404) throw new ValidationError("We could not find your billing record yet. Please try again in a moment.");
  if (status >= 400 && status < 500 && error) throw new ValidationError(error);
  throw new OpsUnavailableError();
}
