import { normaliseEmail } from "./email";
import { assertionMatches, type ProviderEmailAssertion } from "./provider-assertion";
import type { UserStatus } from "./status";

// F3.1.2 identity-link service (docs/platform-foundation-plan.md, Part 3 section 6; behaviour approved by AJ on 2026-11-05).
//
// `findOrCreateBySubject` links a provider identity (provider, subject) to a Platform user. It is the only code that should touch the
// identity tables for this purpose; other modules call it and never read or write `users` or `user_identities` directly
// (identity-link.guard.test.ts enforces this).
//
// What it does, in order:
//  1. Validates the input before any database access (even when the identity already exists).
//  2. Looks the identity up by (provider, subject). Email is never a join key.
//     - Found, user not active  -> `user_disabled`. Never reactivates.
//     - Found, user active      -> returns the existing user UNCHANGED; `emailMatches` says whether the supplied email equals the stored one.
//  3. Not found, and the email belongs to another user -> `email_belongs_to_another_user`. No merging, no attaching.
//  4. Otherwise creates the user and its identity in ONE nested create (atomic: both rows or neither).
//
// Existing users are never modified by this service. `email_verified_at` is set only when a user is created and only from a trusted,
// bound `ProviderEmailAssertion`; a plain boolean cannot do it.
//
// Concurrency: no lock and no explicit transaction. The unique indexes are the guard. A lost race surfaces as Prisma P2002 on a known
// index; the call re-reads once. Same (provider, subject) race: the re-read returns the winner's identity. Same email under another
// subject: the re-read rejects. A second lost race throws IdentityLinkRaceError. Any other unique violation, and any database error that is
// not a known email CHECK violation, propagates unchanged.
//
// KNOWN LIMITATION (not a permanent exemption): no audit row is written. The audit table does not exist yet (C16 prerequisite 4).

export const SUBJECT_MAX_LENGTH = 100;

/** The unique indexes (from the identity migration) this service reacts to. Anything else propagates. */
const IDENTITY_SUBJECT_INDEX = "user_identities_provider_subject_key";
const USER_EMAIL_INDEX = "users_email_key";
/** The three email CHECK constraints a user insert can violate (the JavaScript and PostgreSQL lower-casing gaps reach the last one). */
const EMAIL_CHECKS = ["users_email_not_empty", "users_email_trimmed", "users_email_lowercase"] as const;

type UserRow = { id: string; email: string; status: string; emailVerifiedAt: Date | null };

/** The narrow slice of the Prisma client this service uses. Tests pass a fake; the default is the shared Platform client. */
export interface IdentityLinkClient {
  userIdentity: {
    findUnique(args: { where: { provider_subject: { provider: string; subject: string } }; include: { user: true } }): Promise<{ user: UserRow } | null>;
  };
  user: {
    findUnique(args: { where: { email: string }; select: { id: true } }): Promise<{ id: string } | null>;
    create(args: { data: { email: string; emailVerifiedAt: Date | null; identities: { create: { provider: string; subject: string } } } }): Promise<UserRow>;
  };
}

export type LinkedUser = { id: string; email: string; status: UserStatus; emailVerifiedAt: Date | null };

export type IdentityLinkInput = {
  provider: string;
  subject: string;
  email: string;
  /** Only a trusted assertion minted after provider-token validation can mark the email verified, and only when a user is created. */
  emailAssertion?: ProviderEmailAssertion;
};

export type IdentityLinkResult =
  | { ok: true; user: LinkedUser; created: boolean; emailMatches: boolean }
  | { ok: false; reason: "invalid_input"; field: "provider" | "subject" | "email" | "emailAssertion" }
  | { ok: false; reason: "email_belongs_to_another_user" }
  | { ok: false; reason: "user_disabled" };

/** Thrown only when a lost race could not be resolved by one re-read. Callers should treat it as a failure, not retry blindly. */
export class IdentityLinkRaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdentityLinkRaceError";
  }
}

const invalid = (field: "provider" | "subject" | "email" | "emailAssertion"): IdentityLinkResult => ({ ok: false, reason: "invalid_input", field });

// Non-empty after trimming (the database CHECK is btrim <> ''), and no NUL, which PostgreSQL cannot store. Stored exactly as supplied.
const badText = (v: unknown): boolean => typeof v !== "string" || v.trim() === "" || v.includes("\u0000");

// The error shapes below are read from the installed Prisma 7 driver adapter (@prisma/adapter-pg). With the adapter, a unique violation is P2002
// with the index name at meta.driverAdapterError.cause.constraint.index (or `fields`), and an unmapped check violation is P2039 with the
// PostgreSQL code and message under the same cause. They are checked defensively and anything unrecognised propagates.
type DriverCause = { constraint?: { index?: unknown; fields?: unknown }; originalCode?: unknown; code?: unknown; originalMessage?: unknown; message?: unknown };
const causeOf = (error: unknown): DriverCause | undefined => (error as { meta?: { driverAdapterError?: { cause?: DriverCause } } } | null)?.meta?.driverAdapterError?.cause;
const prismaCode = (error: unknown): unknown => (error as { code?: unknown } | null)?.code;

type Classified = "identity_race" | "email_race" | "email_check" | "other";

function classify(error: unknown): Classified {
  const cause = causeOf(error);
  if (prismaCode(error) === "P2002") {
    const index = cause?.constraint?.index;
    const fields = cause?.constraint?.fields;
    if (index === IDENTITY_SUBJECT_INDEX) return "identity_race";
    if (index === USER_EMAIL_INDEX) return "email_race";
    if (index === undefined && Array.isArray(fields)) {
      if (fields.length === 2 && fields.includes("provider") && fields.includes("subject")) return "identity_race";
      if (fields.length === 1 && fields[0] === "email") return "email_race";
    }
    return "other";
  }
  if (prismaCode(error) === "P2039" && (cause?.originalCode ?? cause?.code) === "23514") {
    const message = String(cause?.originalMessage ?? cause?.message ?? (error as { message?: unknown } | null)?.message ?? "");
    if (EMAIL_CHECKS.some((name) => message.includes(`"${name}"`))) return "email_check";
  }
  return "other";
}

function toLinkedUser(row: UserRow): LinkedUser {
  return { id: row.id, email: row.email, status: row.status as UserStatus, emailVerifiedAt: row.emailVerifiedAt };
}

export async function findOrCreateBySubject(input: IdentityLinkInput, client?: IdentityLinkClient): Promise<IdentityLinkResult> {
  const { provider, subject } = input;
  if (badText(provider)) return invalid("provider");
  if (badText(subject) || subject.length > SUBJECT_MAX_LENGTH) return invalid("subject");
  const email = typeof input.email === "string" ? normaliseEmail(input.email) : null;
  if (email === null) return invalid("email");
  let verified = false;
  if (input.emailAssertion !== undefined) {
    if (!assertionMatches(input.emailAssertion, { provider, subject, email })) return invalid("emailAssertion");
    verified = true;
  }

  const db: IdentityLinkClient = client ?? (await import("@/lib/db")).prisma;

  // Two attempts at most: the first, and one re-read after a lost race.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const identity = await db.userIdentity.findUnique({ where: { provider_subject: { provider, subject } }, include: { user: true } });
    if (identity) {
      // Fails closed: anything other than "active" is refused. This service never reactivates and never writes to an existing user.
      if (identity.user.status !== "active") return { ok: false, reason: "user_disabled" };
      return { ok: true, user: toLinkedUser(identity.user), created: false, emailMatches: identity.user.email === email };
    }

    const owner = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (owner) return { ok: false, reason: "email_belongs_to_another_user" };

    try {
      // One nested create: Prisma writes the user and its identity atomically, so both rows exist or neither does.
      const row = await db.user.create({ data: { email, emailVerifiedAt: verified ? new Date() : null, identities: { create: { provider, subject } } } });
      return { ok: true, user: toLinkedUser(row), created: true, emailMatches: true };
    } catch (error) {
      const kind = classify(error);
      if (kind === "identity_race" || kind === "email_race") continue; // re-read: the winner's identity, or the email's owner, is now visible
      if (kind === "email_check") return invalid("email");
      throw error;
    }
  }
  throw new IdentityLinkRaceError("findOrCreateBySubject: a lost race was not resolved by one re-read");
}
