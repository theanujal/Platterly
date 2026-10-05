import { isProductKey } from "./ids";
import { fail, isRecord, ok, type ParseResult } from "./result";
import { CONTRACT_VERSION } from "./version";

/** A plan's allowance for one thing. `limit` is a number or null (unlimited), `flag` is on/off, `text` a short label. */
export const ENTITLEMENT_TYPES = ["limit", "flag", "text"] as const;
export type EntitlementType = (typeof ENTITLEMENT_TYPES)[number];

export type EntitlementValue = number | boolean | string | null;
export type EntitlementValues = Record<string, EntitlementValue>;

export interface EntitlementDef {
  key: string;
  type: EntitlementType;
  label: string;
}

/** What a product publishes at GET /api/ops/manifest. Ops builds its plan editor and generic screens from it. */
export interface ProductManifest {
  contract: number;
  productKey: string;
  name: string;
  version: string;
  baseUrl: string;
  entitlements: EntitlementDef[];
  /** AJ, 2026-10-05: what a just-signed-up tenant gets before its first snapshot arrives. */
  trial: { days: number; entitlements: EntitlementValues };
  events: string[];
  messageTemplates: string[];
  tabs: { key: string; label: string }[];
  actions: string[];
}

const KEY = /^[a-zA-Z][a-zA-Z0-9]{0,63}$/;

/** Checks `values` against the declared entitlements: no unknown keys, each value the right type. */
export function validateEntitlements(defs: readonly EntitlementDef[], values: unknown): ParseResult<EntitlementValues> {
  if (!isRecord(values)) return fail("entitlements must be an object");
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const out: EntitlementValues = {};
  for (const [key, value] of Object.entries(values)) {
    const def = byKey.get(key);
    if (!def) return fail(`unknown entitlement "${key}"`);
    if (def.type === "limit" && !(value === null || (typeof value === "number" && Number.isInteger(value) && value >= 0))) return fail(`"${key}" must be a whole number or null`);
    if (def.type === "flag" && typeof value !== "boolean") return fail(`"${key}" must be true or false`);
    if (def.type === "text" && !(typeof value === "string" && value.length <= 200)) return fail(`"${key}" must be short text`);
    out[key] = value as EntitlementValue;
  }
  return ok(out);
}

function stringList(value: unknown, name: string): ParseResult<string[]> {
  if (value === undefined) return ok([]);
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string" && v.length > 0 && v.length <= 80)) return fail(`${name} must be a list of short strings`);
  return ok(value as string[]);
}

export function parseManifest(input: unknown): ParseResult<ProductManifest> {
  if (!isRecord(input)) return fail("manifest must be an object");
  if (input.contract !== CONTRACT_VERSION) return fail(`unsupported contract version ${String(input.contract)}`);
  if (!isProductKey(input.productKey)) return fail("productKey is invalid");
  if (typeof input.name !== "string" || !input.name.trim()) return fail("name is required");
  if (typeof input.version !== "string" || !input.version) return fail("version is required");
  if (typeof input.baseUrl !== "string" || !/^https?:\/\//.test(input.baseUrl)) return fail("baseUrl must be an http(s) URL");

  if (!Array.isArray(input.entitlements)) return fail("entitlements must be a list");
  const defs: EntitlementDef[] = [];
  const seen = new Set<string>();
  for (const raw of input.entitlements) {
    if (!isRecord(raw) || typeof raw.key !== "string" || !KEY.test(raw.key)) return fail("entitlement key is invalid");
    if (seen.has(raw.key)) return fail(`entitlement "${raw.key}" is declared twice`);
    if (!ENTITLEMENT_TYPES.includes(raw.type as EntitlementType)) return fail(`entitlement "${raw.key}" has an unknown type`);
    if (typeof raw.label !== "string" || !raw.label.trim()) return fail(`entitlement "${raw.key}" needs a label`);
    seen.add(raw.key);
    defs.push({ key: raw.key, type: raw.type as EntitlementType, label: raw.label });
  }

  if (!isRecord(input.trial) || !Number.isInteger(input.trial.days) || (input.trial.days as number) < 0) return fail("trial.days must be a whole number");
  const trialValues = validateEntitlements(defs, input.trial.entitlements ?? {});
  if (!trialValues.ok) return fail(`trial: ${trialValues.error}`);

  const events = stringList(input.events, "events");
  if (!events.ok) return events;
  const templates = stringList(input.messageTemplates, "messageTemplates");
  if (!templates.ok) return templates;
  const actions = stringList(input.actions, "actions");
  if (!actions.ok) return actions;
  const tabsRaw = input.tabs ?? [];
  if (!Array.isArray(tabsRaw) || !tabsRaw.every((t) => isRecord(t) && typeof t.key === "string" && typeof t.label === "string")) return fail("tabs must be a list of {key, label}");

  return ok({
    contract: CONTRACT_VERSION,
    productKey: input.productKey,
    name: input.name.trim(),
    version: input.version,
    baseUrl: input.baseUrl,
    entitlements: defs,
    trial: { days: input.trial.days as number, entitlements: trialValues.value },
    events: events.value,
    messageTemplates: templates.value,
    tabs: tabsRaw.map((t) => ({ key: String((t as Record<string, unknown>).key), label: String((t as Record<string, unknown>).label) })),
    actions: actions.value,
  });
}
