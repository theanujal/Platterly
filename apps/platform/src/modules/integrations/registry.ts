import type { Prisma } from "@/generated/prisma/client";
import { writeAudit, type Actor } from "../audit/write-audit";
import { decryptSecret, encryptSecret, newSigningSecret } from "./secret-box";

// F6.1.1 product registry. Secrets are decrypted only here, on demand; callers get plain values to sign or verify with and never store them.
// Every change takes the caller's transaction client and writes an audit row in it (no secret values are ever put in the row).

type Db = Pick<Prisma.TransactionClient, "productIntegration" | "auditLog" | "$executeRaw">;
export type Direction = "outbound" | "inbound";

export type Integration = { key: string; name: string; baseUrl: string; status: string };
export type IntegrationSecrets = { current: string; previous: string | null };

export class IntegrationInputError extends Error {}

const PUBLIC = { key: true, name: true, baseUrl: true, status: true } as const;

/** https everywhere; plain http only for this machine (local development). The trailing slash is dropped. */
export function normaliseBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new IntegrationInputError("the product address is not a valid URL");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname.endsWith(".localhost");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) throw new IntegrationInputError("the product address must use https (http is allowed only for localhost)");
  if (url.username || url.password || url.search || url.hash) throw new IntegrationInputError("the product address cannot carry credentials, a query or a fragment");
  return url.toString().replace(/\/+$/, "");
}

export async function getIntegration(db: Pick<Db, "productIntegration">, key: string): Promise<Integration | null> {
  return db.productIntegration.findUnique({ where: { key }, select: PUBLIC });
}

/** Adds the product with a fresh secret pair. Returns the plain secrets ONCE (the product's side has to be given them); a repeat changes nothing and returns null. */
export async function registerIntegration(db: Db, actor: Actor, input: { key: string; name: string; baseUrl: string }): Promise<{ outbound: string; inbound: string } | null> {
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(input.key)) throw new IntegrationInputError("the product key is not valid");
  const baseUrl = normaliseBaseUrl(input.baseUrl);
  const outbound = newSigningSecret();
  const inbound = newSigningSecret();
  // One statement, so two simultaneous registrations cannot both win: the loser inserts nothing.
  const { count } = await db.productIntegration.createMany({ data: [{ key: input.key, name: input.name, baseUrl, outboundSecret: encryptSecret(outbound), inboundSecret: encryptSecret(inbound) }], skipDuplicates: true });
  if (count === 0) return null;
  await writeAudit(db, { action: "product_integration.registered", outcome: "done", initiator: actor, executor: actor, subject: { type: "product", id: input.key }, after: { key: input.key, baseUrl } });
  return { outbound, inbound };
}

export async function getSecrets(db: Pick<Db, "productIntegration">, key: string, direction: Direction): Promise<IntegrationSecrets | null> {
  const row = await db.productIntegration.findUnique({ where: { key }, select: { outboundSecret: true, outboundSecretPrevious: true, inboundSecret: true, inboundSecretPrevious: true } });
  if (!row) return null;
  const [current, previous] = direction === "outbound" ? [row.outboundSecret, row.outboundSecretPrevious] : [row.inboundSecret, row.inboundSecretPrevious];
  return { current: decryptSecret(current), previous: previous ? decryptSecret(previous) : null };
}

/** Rotation: the current secret becomes the previous one (still accepted when verifying) and a new one is issued. One SQL statement, so a simultaneous rotation cannot lose the previous secret. Returns the new plain secret once. */
export async function rotateSecret(db: Db, actor: Actor, key: string, direction: Direction): Promise<string | null> {
  const fresh = newSigningSecret();
  const stored = encryptSecret(fresh);
  const changed = direction === "outbound"
    ? await db.$executeRaw`UPDATE product_integrations SET outbound_secret_previous = outbound_secret, outbound_secret = ${stored}, secrets_rotated_at = now(), updated_at = now() WHERE key = ${key}`
    : await db.$executeRaw`UPDATE product_integrations SET inbound_secret_previous = inbound_secret, inbound_secret = ${stored}, secrets_rotated_at = now(), updated_at = now() WHERE key = ${key}`;
  if (changed === 0) return null;
  await writeAudit(db, { action: "product_integration.secret_rotated", outcome: "done", initiator: actor, executor: actor, subject: { type: "product", id: key }, after: { key, direction } });
  return fresh;
}

/** Ends an overlap once the product has switched to the new secret. Returns false when the product is unknown. */
export async function retirePreviousSecret(db: Db, actor: Actor, key: string, direction: Direction): Promise<boolean> {
  const { count } = await db.productIntegration.updateMany({ where: { key }, data: direction === "outbound" ? { outboundSecretPrevious: null } : { inboundSecretPrevious: null } });
  if (count === 0) return false;
  await writeAudit(db, { action: "product_integration.secret_retired", outcome: "done", initiator: actor, executor: actor, subject: { type: "product", id: key }, after: { key, direction } });
  return true;
}
