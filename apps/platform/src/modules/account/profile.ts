import type { Pool } from "pg";
import { normalizePhone } from "./phone";

// Account profile: name (in the provider's user table), phone, time zone and the product-updates choice (in accountProfile). Every query is scoped to
// the caller's own provider user id, taken from the verified session by the route, never from the request body.
export type Profile = { photoVersion: string | null; name: string; firstName: string; lastName: string; email: string; emailVerified: boolean; phone: string; timeZone: string; notifyProductUpdates: boolean };
export type ProfileInput = { firstName?: unknown; lastName?: unknown; phone?: unknown; timeZone?: unknown; notifyProductUpdates?: unknown };
export type ProfileErrors = Partial<Record<"firstName" | "lastName" | "phone" | "timeZone" | "notifyProductUpdates", string>>;

export const DEFAULT_TIME_ZONE = "Asia/Kolkata";
const NAME_MAX = 40;

/** A real time zone name. Node's own list uses older names for some zones (it lists "Asia/Calcutta", not "Asia/Kolkata"), so validity is asked of Intl itself. */
export function isTimeZone(value: string): boolean {
  if (value.length > 64 || !/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/.test(value)) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The zones offered in the list: the runtime's own, plus the default, which some runtimes name differently. */
export function timeZones(): string[] {
  const list = (Intl as unknown as { supportedValuesOf(key: string): string[] }).supportedValuesOf("timeZone");
  return list.includes(DEFAULT_TIME_ZONE) ? list : [...list, DEFAULT_TIME_ZONE].sort();
}

type Clean = { firstName?: string; lastName?: string; phone?: string; timeZone?: string; notifyProductUpdates?: boolean };

/** Checks and tidies what the person typed. Only the fields present are checked (a partial update leaves the others alone). */
export function validateProfile(input: ProfileInput): { ok: true; clean: Clean } | { ok: false; errors: ProfileErrors } {
  const errors: ProfileErrors = {};
  const clean: Clean = {};
  for (const [key, label] of [["firstName", "first"], ["lastName", "last"]] as const) {
    if (input[key] === undefined) continue;
    const value = typeof input[key] === "string" ? (input[key] as string).trim().replace(/\s+/g, " ") : "";
    if (!value) errors[key] = `Enter your ${label} name.`;
    else if (value.length > NAME_MAX) errors[key] = `Use at most ${NAME_MAX} characters.`;
    else if (/[\u0000-\u001f<>]/.test(value)) errors[key] = "Use letters, numbers and common punctuation only.";
    else clean[key] = value;
  }
  if (input.phone !== undefined) {
    // Required: a phone cannot be cleared, only changed to another valid number.
    const phone = typeof input.phone === "string" ? normalizePhone(input.phone) : null;
    if (!phone) errors.phone = "Enter a valid phone number.";
    else clean.phone = phone;
  }
  if (input.timeZone !== undefined) {
    if (typeof input.timeZone === "string" && isTimeZone(input.timeZone)) clean.timeZone = input.timeZone;
    else errors.timeZone = "Choose a time zone from the list.";
  }
  if (input.notifyProductUpdates !== undefined) {
    if (typeof input.notifyProductUpdates === "boolean") clean.notifyProductUpdates = input.notifyProductUpdates;
    else errors.notifyProductUpdates = "Choose on or off.";
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, clean };
}

export async function getProfile(pool: Pool, userId: string): Promise<Profile | null> {
  const { rows } = await pool.query(
    'select u."name", u."firstName", u."lastName", u."email", u."emailVerified", u."phone", p."timeZone", p."notifyProductUpdates", case when p."photoKey" is not null then floor(extract(epoch from p."photoUpdatedAt") * 1000)::bigint::text end as "photoVersion" from "user" u left join "accountProfile" p on p."userId" = u."id" where u."id" = $1',
    [userId],
  );
  const r = rows[0];
  if (!r) return null;
  return { photoVersion: r.photoVersion ?? null, name: r.name, firstName: r.firstName ?? "", lastName: r.lastName ?? "", email: r.email, emailVerified: r.emailVerified, phone: r.phone ?? "", timeZone: r.timeZone ?? DEFAULT_TIME_ZONE, notifyProductUpdates: r.notifyProductUpdates ?? false };
}

/** Saves the fields given (already validated). Returns the profile as stored, or null when the person does not exist. */
export async function saveProfile(pool: Pool, userId: string, clean: Clean): Promise<Profile | null> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (clean.firstName !== undefined || clean.lastName !== undefined || clean.phone !== undefined) {
      // The display name is always first + last; a name saved before the split has its parts filled from it.
      await client.query(
        `update "user" set "firstName" = coalesce($2, "firstName"), "lastName" = coalesce($3, "lastName"), "phone" = coalesce($4, "phone"),
           "name" = trim(coalesce($2, "firstName", '') || ' ' || coalesce($3, "lastName", '')), "updatedAt" = now() where "id" = $1`,
        [userId, clean.firstName ?? null, clean.lastName ?? null, clean.phone ?? null],
      );
    }
    if (clean.timeZone !== undefined || clean.notifyProductUpdates !== undefined) {
      await client.query('insert into "accountProfile" ("userId") values ($1) on conflict ("userId") do nothing', [userId]);
      if (clean.timeZone !== undefined) await client.query('update "accountProfile" set "timeZone" = $2, "updatedAt" = now() where "userId" = $1', [userId, clean.timeZone]);
      if (clean.notifyProductUpdates !== undefined) await client.query('update "accountProfile" set "notifyProductUpdates" = $2, "updatedAt" = now() where "userId" = $1', [userId, clean.notifyProductUpdates]);
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  return getProfile(pool, userId);
}
