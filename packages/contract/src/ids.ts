import { randomBytes } from "node:crypto";

/** Opaque ids: a short prefix says what it is, 32 hex characters make it unique. */
const PREFIXES = { business: "biz", subscription: "sub", event: "evt", command: "cmd" } as const;
export type IdKind = keyof typeof PREFIXES;

export function newId(kind: IdKind): string {
  return `${PREFIXES[kind]}_${randomBytes(16).toString("hex")}`;
}

export function isId(kind: IdKind, value: unknown): value is string {
  return typeof value === "string" && new RegExp(`^${PREFIXES[kind]}_[0-9a-f]{32}$`).test(value);
}

/** Lowercase letters, digits and dashes; starts with a letter. Matches the registry and the subdomain. */
export function isProductKey(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9-]{1,31}$/.test(value);
}
