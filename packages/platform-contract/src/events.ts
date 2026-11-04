import { isId } from "../../contract/src/ids";
import { fail, isIsoDate, isRecord, ok, type ParseResult } from "../../contract/src/result";
import { isSequence } from "./sequence";
import { PLATFORM_CONTRACT_VERSION } from "./version";

/** Events Platform Core sends a product (POST {product}/api/platform/events), through its outbox. */
export const EVENT_TYPES = ["membership.changed", "organisation.status", "owner.changed"] as const;
export type PlatformEventType = (typeof EVENT_TYPES)[number];

/** Who a member is in the business. Roles are the product's own keys; the platform sends the key it has. */
export const MEMBERSHIP_STATUSES = ["active", "disabled", "removed"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const ORGANISATION_STATUSES = ["active", "suspended", "closed"] as const;
export type OrganisationStatus = (typeof ORGANISATION_STATUSES)[number];

export interface MembershipChangedData {
  userId: string;
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
    return ok({ userId, role, status: status as MembershipStatus, membershipVersion });
  }
  if (type === "organisation.status") {
    if (!ORGANISATION_STATUSES.includes(input.status as OrganisationStatus)) return fail("data.status is not known");
    return ok({ status: input.status as OrganisationStatus });
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
