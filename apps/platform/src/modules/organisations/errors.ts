import type { Actor } from "../audit/write-audit";

// F3.2.2 shared types. A service returns a Refusal for a domain refusal (after writing one refused audit row, so the caller commits it) and
// throws only for a programmer error or an unexpected database failure, which rolls the caller's transaction back.
export type RefusalCode =
  | "user_not_found"
  | "user_not_active"
  | "email_not_verified"
  | "slot_taken"
  | "idempotency_conflict"
  | "admin_mismatch"
  | "admin_exists"
  | "same_admin"
  | "former_admin_reappointment_not_decided"
  | "product_not_linked"
  | "last_link";

export type Refusal = { ok: false; code: RefusalCode; detail?: Record<string, number | string> };
export type Done<T> = { ok: true } & T;
export type Result<T> = Done<T> | Refusal;

/** Who is acting. Every state change and every refusal is audited with these. */
export type Context = { initiator: Actor; executor: Actor; requestId?: string };

export class OrganisationNotFoundError extends Error {}
export class OneOrganisationPerTransactionError extends Error {}
export class InvalidInputError extends Error {}
/** A unique-index race lost to another transaction (cannot be audited: the database aborted this transaction). */
export class SlotRaceError extends Error {}

export const PRODUCT_KEY = /^[a-z][a-z0-9-]{1,31}$/;
export const assertProductKey = (key: string) => {
  if (!PRODUCT_KEY.test(key)) throw new InvalidInputError(`product key ${JSON.stringify(key)} is not valid`);
};
