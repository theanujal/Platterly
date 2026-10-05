/**
 * The link to Platterly Ops (docs/ops-contract.md). Everything is off until these are set, so dev, CI and every
 * existing test behave exactly as before:
 *   OPS_BASE_URL          where ops listens (events are posted to <it>/api/products/events), e.g. http://127.0.0.1:3200
 *   OPS_EVENT_SECRET      this product signs events and replies with it (ops shows it as "the product signs events with")
 *   OPS_COMMAND_SECRETS   ops signs commands and reads with it; comma separated so the old and the new one both work
 *                         during a rotation (ops shows it as "ops signs commands with")
 *   OPS_PRODUCT_KEY       the key ops registered this product under (default "catering")
 *   OPS_BILLING           "1" makes ops the source of truth for plans and the lock (docs/ops-contract.md 8.3). Off (the
 *                         default), catering reads its own plan rows exactly as before, whatever snapshots ops has sent.
 */
export interface OpsLinkConfig {
  productKey: string;
  baseUrl: string;
  eventSecret: string;
  commandSecrets: string[];
}

export function opsLink(): OpsLinkConfig | null {
  const baseUrl = process.env.OPS_BASE_URL?.trim().replace(/\/+$/, "");
  const eventSecret = process.env.OPS_EVENT_SECRET?.trim();
  const commandSecrets = (process.env.OPS_COMMAND_SECRETS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!baseUrl || !eventSecret || commandSecrets.length === 0) return null;
  return { productKey: process.env.OPS_PRODUCT_KEY?.trim() || "catering", baseUrl, eventSecret, commandSecrets };
}

/** The cutover flag: only with the link on AND OPS_BILLING=1 does a stored ops snapshot decide limits and the lock. */
export function opsBillingOn(): boolean {
  return opsLink() !== null && process.env.OPS_BILLING === "1";
}
