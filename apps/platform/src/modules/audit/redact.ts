// W1-B: audit and outbox payloads must never carry secrets. A key is sensitive when any word in its name is `otp`, or contains `secret`,
// `token`, `password` or `hash` (camelCase, snake_case and kebab-case are split into words, so `passwordHash`, `reset_token` and `OTP` match
// but `footprint` and `photo` do not).
const SENSITIVE_PART = /secret|token|password|hash/;

export const REDACTED = "[redacted]";

export function isSensitiveKey(key: string): boolean {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return words.some((w) => w === "otp" || SENSITIVE_PART.test(w));
}

/** The key paths (dot-separated, arrays as `[]`) of every sensitive key in a JSON value. */
export function sensitivePaths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((v) => sensitivePaths(v, `${prefix}[]`));
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return isSensitiveKey(k) ? [path] : sensitivePaths(v, path);
  });
}

/** A copy of a JSON value with the value of every sensitive key replaced by "[redacted]" (the key is kept so the record shows it existed). */
export function redact<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => redact(v)) as unknown as T;
  if (value === null || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = isSensitiveKey(k) ? REDACTED : redact(v);
  return out as T;
}
