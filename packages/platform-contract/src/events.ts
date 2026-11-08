import { isId } from "../../contract/src/ids";
import { fail, isIsoDate, isRecord, ok, type ParseResult } from "../../contract/src/result";
import { isSequence } from "./sequence";
import { PLATFORM_CONTRACT_VERSION } from "./version";

/** Events Platform Core sends a product (POST {product}/api/platform/events), through its outbox. */
export const EVENT_TYPES = ["membership.changed", "organisation.status", "owner.changed", "person.profile"] as const;
export type PlatformEventType = (typeof EVENT_TYPES)[number];

/** Who a member is in the business. Roles are the product's own keys; the platform sends the key it has. */
export const MEMBERSHIP_STATUSES = ["active", "disabled", "removed"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const ORGANISATION_STATUSES = ["active", "suspended", "closed"] as const;
export type OrganisationStatus = (typeof ORGANISATION_STATUSES)[number];

export interface MembershipChangedData {
  userId: string;
  /**
   * The identity provider's person id (what a product's sign-in link stores). The Platform adds it when it SENDS the event, so a product that links people
   * by that id can find the person; the outbox itself only holds the Platform user id. Optional in the contract so older senders and consumers still parse.
   */
  subject?: string;
  role: string;
  status: MembershipStatus;
  /** Goes up on every membership change in the business; the product's pull compares it (Part 1 section 4, layer 2). */
  membershipVersion: number;
}
export interface OrganisationStatusData {
  status: OrganisationStatus;
}
export interface OwnerChangedData {
  /** Every current owner, 1 to 3. */
  ownerUserIds: string[];
  /** Where the billing contact now is; email is never a join key. */
  billingContactEmail: string;
}

/**
 * A person's common details changed in the Account (name, phone, sign-in email). Sent once per product the person holds a seat in, so the product's
 * copy follows without waiting for the next sign-in. `subject` is the identity provider's person id (what a product's sign-in link stores); `userId` is
 * the Platform's id for the same person. Nothing secret is carried.
 */
export interface PersonProfileData {
  userId: string;
  subject: string;
  firstName: string;
  lastName: string;
  /** International format. An empty string means the person has none on file. */
  phone: string;
  email: string;
}

type EventBase = {
  version: number;
  /** `evt_<32 hex>`. A retry sends the same one, so applying it twice is harmless. */
  eventId: string;
  businessId: string;
  /** Per business, only goes up. See `shouldApply`. */
  sequence: number;
  occurredAt: string;
};
export type PlatformEvent = EventBase &
  (
    | { type: "membership.changed"; data: MembershipChangedData }
    | { type: "organisation.status"; data: OrganisationStatusData }
    | { type: "owner.changed"; data: OwnerChangedData }
    | { type: "person.profile"; data: PersonProfileData }
  );

const shortText = (v: unknown, max = 200): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;
const isUserId = (v: unknown): v is string => shortText(v, 100);

function parseData(type: PlatformEventType, input: unknown): ParseResult<PlatformEvent["data"]> {
  if (!isRecord(input)) return fail("data must be an object");
  if (type === "membership.changed") {
    const { userId, role, status, membershipVersion } = input;
    if (!isUserId(userId)) return fail("data.userId is required");
    if (!shortText(role, 64)) return fail("data.role is required");
    if (!MEMBERSHIP_STATUSES.includes(status as MembershipStatus)) return fail("data.status is not known");
    if (!isSequence(membershipVersion)) return fail("data.membershipVersion must be a whole number of 1 or more");
    const subject = input.subject;
    if (subject !== undefined && !isUserId(subject)) return fail("data.subject must be text when present");
    return ok({ userId, ...(subject !== undefined ? { subject } : {}), role, status: status as MembershipStatus, membershipVersion });
  }
  if (type === "organisation.status") {
    if (!ORGANISATION_STATUSES.includes(input.status as OrganisationStatus)) return fail("data.status is not known");
    return ok({ status: input.status as OrganisationStatus });
  }
  if (type === "person.profile") {
    const { userId, subject, firstName, lastName, phone, email } = input;
    if (!isUserId(userId) || !isUserId(subject)) return fail("data.userId and data.subject are required");
    if (!shortText(firstName, 80) || !shortText(lastName, 80)) return fail("data.firstName and data.lastName are required");
    if (typeof phone !== "string" || phone.length > 32) return fail("data.phone must be text of at most 32 characters");
    if (!shortText(email, 254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("data.email must be an email address");
    return ok({ userId, subject, firstName, lastName, phone, email });
  }
  const { ownerUserIds, billingContactEmail } = input;
  if (!Array.isArray(ownerUserIds) || ownerUserIds.length < 1 || ownerUserIds.length > 3 || !ownerUserIds.every(isUserId) || new Set(ownerUserIds).size !== ownerUserIds.length) return fail("data.ownerUserIds must be 1 to 3 different user ids");
  if (!shortText(billingContactEmail, 254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billingContactEmail)) return fail("data.billingContactEmail must be an email address");
  return ok({ ownerUserIds, billingContactEmail });
}

/** Parses the raw body of an event delivery. Verify the signature first (`verifyPlatformRequest`), then parse. */
export function parsePlatformEvent(input: unknown): ParseResult<PlatformEvent> {
  if (!isRecord(input)) return fail("the event must be an object");
  if (input.version !== PLATFORM_CONTRACT_VERSION) return fail(`contract version ${String(input.version)} is not supported`);
  if (!isId("event", input.eventId)) return fail("eventId is not valid");
  if (!isId("business", input.businessId)) return fail("businessId is not valid");
  if (!isSequence(input.sequence)) return fail("sequence must be a whole number of 1 or more");
  if (!isIsoDate(input.occurredAt)) return fail("occurredAt must be a date");
  if (!EVENT_TYPES.includes(input.type as PlatformEventType)) return fail("type is not known");
  const type = input.type as PlatformEventType;
  const data = parseData(type, input.data);
  if (!data.ok) return fail(data.error);
  return ok({ version: input.version, eventId: input.eventId, businessId: input.businessId, sequence: input.sequence, occurredAt: input.occurredAt, type, data: data.value } as PlatformEvent);
}
