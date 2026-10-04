/**
 * Chunk 25 — a small request validator for the public API: every field of a body or query is checked for type, size and
 * allowed values, and ALL the problems are reported together (`details`), not just the first. Nothing is trusted and
 * nothing unknown is passed on: a field that is not in the schema is an error, so a caller cannot slip in a field
 * (a tenant id, a price, a status) the endpoint did not offer.
 */
export interface FieldIssue {
  field: string;
  message: string;
}

export class ApiValidationError extends Error {
  constructor(public issues: FieldIssue[]) {
    super(issues.map((i) => `${i.field}: ${i.message}`).join("; "));
    this.name = "ApiValidationError";
  }
}

type Check<T> = (value: unknown, field: string, issues: FieldIssue[]) => T | undefined;
export interface Spec<T> {
  check: Check<T>;
  optional: boolean;
}

const spec = <T,>(check: Check<T>): Spec<T> => ({ check, optional: false });

export const v = {
  string: (opts: { min?: number; max?: number; pattern?: RegExp; message?: string } = {}) =>
    spec<string>((value, field, issues) => {
      if (typeof value !== "string") return void issues.push({ field, message: "must be a string" });
      const text = value.trim();
      if (text.length < (opts.min ?? 1)) return void issues.push({ field, message: opts.min === 0 ? "is too short" : "must not be empty" });
      if (text.length > (opts.max ?? 500)) return void issues.push({ field, message: `must be at most ${opts.max ?? 500} characters` });
      if (opts.pattern && !opts.pattern.test(text)) return void issues.push({ field, message: opts.message ?? "is not in the expected format" });
      return text;
    }),
  email: () =>
    spec<string>((value, field, issues) => {
      if (typeof value !== "string" || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return void issues.push({ field, message: "must be a valid email address" });
      return value.trim();
    }),
  phone: () =>
    spec<string>((value, field, issues) => {
      if (typeof value !== "string" || !/^\+?\d{7,15}$/.test(value.replace(/[\s\-().]/g, ""))) return void issues.push({ field, message: "must be a valid phone number (7 to 15 digits, optional +)" });
      return value.trim();
    }),
  int: (opts: { min?: number; max?: number } = {}) =>
    spec<number>((value, field, issues) => {
      if (typeof value !== "number" || !Number.isInteger(value)) return void issues.push({ field, message: "must be a whole number" });
      if (value < (opts.min ?? 0)) return void issues.push({ field, message: `must be at least ${opts.min ?? 0}` });
      if (value > (opts.max ?? 100_000)) return void issues.push({ field, message: `must be at most ${opts.max ?? 100_000}` });
      return value;
    }),
  boolean: () =>
    spec<boolean>((value, field, issues) => {
      if (typeof value !== "boolean") return void issues.push({ field, message: "must be true or false" });
      return value;
    }),
  /** A calendar date, YYYY-MM-DD, returned as a UTC midnight Date (how Platterly stores event dates). */
  date: () =>
    spec<Date>((value, field, issues) => {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return void issues.push({ field, message: "must be a date as YYYY-MM-DD" });
      const date = new Date(`${value}T00:00:00.000Z`);
      if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return void issues.push({ field, message: "is not a real date" });
      return date;
    }),
  oneOf: <const T extends readonly string[]>(values: T) =>
    spec<T[number]>((value, field, issues) => {
      if (typeof value !== "string" || !values.includes(value)) return void issues.push({ field, message: `must be one of: ${values.join(", ")}` });
      return value as T[number];
    }),
  id: () =>
    spec<string>((value, field, issues) => {
      if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) return void issues.push({ field, message: "must be an id" });
      return value;
    }),
  array: <T,>(item: Spec<T>, opts: { max?: number; min?: number } = {}) =>
    spec<T[]>((value, field, issues) => {
      if (!Array.isArray(value)) return void issues.push({ field, message: "must be a list" });
      if (value.length < (opts.min ?? 0)) return void issues.push({ field, message: `needs at least ${opts.min} item(s)` });
      if (value.length > (opts.max ?? 100)) return void issues.push({ field, message: `can have at most ${opts.max ?? 100} items` });
      const out: T[] = [];
      value.forEach((entry, i) => {
        const checked = item.check(entry, `${field}[${i}]`, issues);
        if (checked !== undefined) out.push(checked);
      });
      return out;
    }),
  object: <S extends Record<string, Spec<unknown>>>(shape: S) =>
    spec<{ [K in keyof S]: S[K] extends Spec<infer U> ? U | undefined : never }>((value, field, issues) => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) return void issues.push({ field, message: "must be an object" });
      const input = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(input)) if (!(key in shape)) issues.push({ field: field ? `${field}.${key}` : key, message: "is not a known field" });
      for (const [key, rule] of Object.entries(shape)) {
        const given = input[key];
        const path = field ? `${field}.${key}` : key;
        if (given === undefined) {
          if (!rule.optional) issues.push({ field: path, message: "is required" });
          continue;
        }
        if (given === null && rule.optional) {
          out[key] = null;
          continue;
        }
        const checked = rule.check(given, path, issues);
        if (checked !== undefined) out[key] = checked;
      }
      return out as never;
    }),
  optional: <T,>(inner: Spec<T>): Spec<T> => ({ check: inner.check, optional: true }),
};

/** Runs a spec over a value and throws `ApiValidationError` with every problem when anything is wrong. */
export function parse<T>(rule: Spec<T>, value: unknown): T {
  const issues: FieldIssue[] = [];
  const out = rule.check(value, "", issues);
  if (issues.length > 0 || out === undefined) throw new ApiValidationError(issues.length > 0 ? issues : [{ field: "body", message: "is not valid" }]);
  return out;
}

/** Query strings arrive as text; turns the ones a spec expects as numbers or booleans into those, leaving the rest as text. */
export function queryObject(searchParams: URLSearchParams, numeric: string[] = [], booleans: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);
    if (values.length > 1) {
      out[key] = values; // repeated parameters are never expected; the spec will reject the list
      continue;
    }
    const raw = values[0];
    if (numeric.includes(key) && /^-?\d+$/.test(raw)) out[key] = Number(raw);
    else if (booleans.includes(key) && (raw === "true" || raw === "false")) out[key] = raw === "true";
    else out[key] = raw;
  }
  return out;
}
