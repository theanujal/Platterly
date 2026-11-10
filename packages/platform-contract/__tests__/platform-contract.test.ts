import { describe, expect, it } from "vitest";
import { newId } from "../../contract/index";
import {
  DELIVERY_BACKOFF_SECONDS,
  PLATFORM_CONTRACT_VERSION,
  parseBusinessRenamed,
  parseBusinessRenamedAnswer,
  parseIdTokenClaims,
  parseIssueClaimRequest,
  parseOrganisationLinkAnswer,
  parseOrganisationLinkCommand,
  parsePlatformEvent,
  shouldApply,
  signPlatformRequest,
  verifyPlatformRequest,
} from "../index";

const SECRET = "platsec_test_secret";
const business = newId("business");
const baseEvent = () => ({ version: PLATFORM_CONTRACT_VERSION, eventId: newId("event"), businessId: business, sequence: 5, occurredAt: "2026-11-01T10:00:00.000Z" });
const membership = () => ({ ...baseEvent(), type: "membership.changed", data: { userId: "usr_1", role: "admin", status: "active", membershipVersion: 3 } });

describe("events: round trip", () => {
  it("parses each event type and returns what was sent", () => {
    const events = [
      membership(),
      { ...membership(), data: { ...membership().data, subject: "sub_1" } },
      { ...baseEvent(), type: "organisation.status", data: { status: "suspended" } },
      { ...baseEvent(), type: "owner.changed", data: { ownerUserIds: ["usr_1", "usr_2"], billingContactEmail: "owner@example.com" } },
      { ...baseEvent(), type: "person.profile", data: { userId: "usr_1", subject: "sub_1", firstName: "Asha", lastName: "Rao", phone: "+919876543210", email: "asha@example.com" } },
    ];
    for (const event of events) {
      const parsed = parsePlatformEvent(JSON.parse(JSON.stringify(event)));
      expect(parsed).toEqual({ ok: true, value: event });
    }
  });

  it("refuses a wrong version (old and future), a bad id, a bad sequence, an unknown type and bad data", () => {
    const bad = (patch: object) => parsePlatformEvent({ ...membership(), ...patch }).ok;
    expect(bad({ version: 0 })).toBe(false);
    expect(bad({ version: PLATFORM_CONTRACT_VERSION + 1 })).toBe(false);
    expect(bad({ eventId: "evt_nothex" })).toBe(false);
    expect(bad({ businessId: "usr_1" })).toBe(false);
    expect(bad({ sequence: 0 })).toBe(false);
    expect(bad({ sequence: 1.5 })).toBe(false);
    expect(bad({ occurredAt: "yesterday" })).toBe(false);
    expect(bad({ type: "billing.changed" })).toBe(false);
    expect(bad({ data: { userId: "usr_1", role: "admin", status: "gone", membershipVersion: 3 } })).toBe(false);
    expect(bad({ data: null })).toBe(false);
    expect(parsePlatformEvent("nope").ok).toBe(false);
    const owners = (ownerUserIds: unknown) => parsePlatformEvent({ ...baseEvent(), type: "owner.changed", data: { ownerUserIds, billingContactEmail: "a@b.co" } }).ok;
    expect(owners([])).toBe(false);
    expect(owners(["a", "b", "c", "d"])).toBe(false);
    expect(owners(["a", "a"])).toBe(false);
    expect(owners(["a"])).toBe(true);
  });
});

describe("events: person.profile", () => {
  const profile = (data: object) => parsePlatformEvent({ ...baseEvent(), type: "person.profile", data: { userId: "usr_1", subject: "sub_1", firstName: "Asha", lastName: "Rao", phone: "+919876543210", email: "asha@example.com", ...data } }).ok;
  it("needs both ids, both names and a valid email; an empty phone is allowed, a long one is not", () => {
    expect(profile({})).toBe(true);
    expect(profile({ phone: "" })).toBe(true);
    expect(profile({ phone: "9".repeat(33) })).toBe(false);
    expect(profile({ subject: "" })).toBe(false);
    expect(profile({ userId: undefined })).toBe(false);
    expect(profile({ firstName: " " })).toBe(false);
    expect(profile({ lastName: 5 })).toBe(false);
    expect(profile({ email: "not-an-email" })).toBe(false);
  });
});

describe("sequence numbers", () => {
  it("applies only a higher number than the last applied", () => {
    expect(shouldApply(null, 1)).toBe(true);
    expect(shouldApply(4, 5)).toBe(true);
    expect(shouldApply(5, 5)).toBe(false);
    expect(shouldApply(5, 4)).toBe(false);
    expect(shouldApply(null, 0)).toBe(false);
    expect(shouldApply(null, NaN)).toBe(false);
  });
});

describe("signing: route-bound, tamper, replay, rotation", () => {
  const url = "https://catering.platterly.in/api/platform/events";
  const body = JSON.stringify(membership());
  const sign = (over: { now?: number; secret?: string; method?: string; url?: string } = {}) => signPlatformRequest(over.secret ?? SECRET, newId("event"), body, over.method ?? "POST", over.url ?? url, over.now);

  it("verifies a good request", () => {
    expect(verifyPlatformRequest([SECRET], sign(), body, "POST", url).ok).toBe(true);
  });

  it("refuses a tampered body, a wrong secret, a wrong method, a wrong route and another business's query", () => {
    expect(verifyPlatformRequest([SECRET], sign(), body.replace("admin", "owner"), "POST", url)).toMatchObject({ ok: false, reason: "bad_signature" });
    expect(verifyPlatformRequest(["platsec_other"], sign(), body, "POST", url).ok).toBe(false);
    expect(verifyPlatformRequest([SECRET], sign(), body, "PUT", url).ok).toBe(false);
    expect(verifyPlatformRequest([SECRET], sign(), body, "POST", "https://catering.platterly.in/api/platform/commands").ok).toBe(false);
    expect(verifyPlatformRequest([SECRET], sign({ url: `${url}?business=biz_a` }), body, "POST", `${url}?business=biz_b`).ok).toBe(false);
  });

  it("ignores the host: the same route on another host still verifies", () => {
    expect(verifyPlatformRequest([SECRET], sign(), body, "POST", "http://127.0.0.1:3000/api/platform/events").ok).toBe(true);
  });

  it("refuses a request outside the 300 second window, in both directions, and accepts the edge", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(verifyPlatformRequest([SECRET], sign({ now: now - 301 }), body, "POST", url, now)).toMatchObject({ ok: false, reason: "stale_timestamp" });
    expect(verifyPlatformRequest([SECRET], sign({ now: now + 301 }), body, "POST", url, now)).toMatchObject({ ok: false, reason: "stale_timestamp" });
    expect(verifyPlatformRequest([SECRET], sign({ now: now - 300 }), body, "POST", url, now).ok).toBe(true);
  });

  it("refuses missing headers and an empty secret list", () => {
    expect(verifyPlatformRequest([SECRET], {}, body, "POST", url)).toMatchObject({ ok: false, reason: "missing_headers" });
    expect(verifyPlatformRequest([], sign(), body, "POST", url)).toMatchObject({ ok: false, reason: "no_secret" });
  });

  it("accepts the old or the new secret during a rotation", () => {
    expect(verifyPlatformRequest(["platsec_new", SECRET], sign(), body, "POST", url).ok).toBe(true);
    expect(verifyPlatformRequest(["platsec_new", SECRET], sign({ secret: "platsec_new" }), body, "POST", url).ok).toBe(true);
  });

  it("a v1 (unbound) signature is not accepted on this channel", async () => {
    const { signedHeaders } = await import("../../contract/index");
    expect(verifyPlatformRequest([SECRET], signedHeaders(SECRET, newId("event"), body), body, "POST", url).ok).toBe(false);
  });
});

describe("ID-token claims", () => {
  const claims = () => ({ iss: "https://auth.platterly.in", aud: "catering", sub: "usr_1", exp: 1893456000, iat: 1893455100, nonce: "n1", email: "a@b.co", email_verified: true, name: "A B", membership_version: 2 });

  it("round-trips the minimal claims and carries nothing about roles", () => {
    expect(parseIdTokenClaims(claims())).toEqual({ ok: true, value: claims() });
    expect(Object.keys(claims())).not.toContain("role");
  });

  it("drops unknown claims instead of passing them on", () => {
    const parsed = parseIdTokenClaims({ ...claims(), role: "owner", memberships: ["biz"] });
    expect(parsed.ok && Object.keys(parsed.value)).not.toContain("role");
  });

  it("refuses a missing or mistyped claim", () => {
    for (const patch of [{ sub: "" }, { aud: ["a", "b"] }, { exp: "soon" }, { email: "not-an-email" }, { email_verified: "true" }, { membership_version: 0 }, { iss: undefined }]) {
      expect(parseIdTokenClaims({ ...claims(), ...patch }).ok).toBe(false);
    }
    expect(parseIdTokenClaims(null).ok).toBe(false);
  });
});

describe("organisation claims and link commands", () => {
  it("lower-cases the bound email and refuses a bad business id", () => {
    expect(parseIssueClaimRequest({ businessId: business, boundEmail: " Owner@Example.COM " })).toEqual({ ok: true, value: { businessId: business, boundEmail: "owner@example.com" } });
    expect(parseIssueClaimRequest({ businessId: "x", boundEmail: "a@b.co" }).ok).toBe(false);
    expect(parseIssueClaimRequest({ businessId: business, boundEmail: "" }).ok).toBe(false);
  });

  it("parses organisation.link, trims the name and refuses old versions and bad ids", () => {
    const command = { version: PLATFORM_CONTRACT_VERSION, commandId: newId("command"), type: "organisation.link", businessId: business, businessName: "  Spice Route  " };
    expect(parseOrganisationLinkCommand(command)).toEqual({ ok: true, value: { ...command, businessName: "Spice Route" } });
    expect(parseOrganisationLinkCommand({ ...command, version: 0 }).ok).toBe(false);
    expect(parseOrganisationLinkCommand({ ...command, commandId: newId("event") }).ok).toBe(false);
    expect(parseOrganisationLinkCommand({ ...command, type: "organisation.unlink" }).ok).toBe(false);
    expect(parseOrganisationLinkCommand({ ...command, businessName: " " }).ok).toBe(false);
  });

  it("parses the answer, including a repeat that created nothing", () => {
    expect(parseOrganisationLinkAnswer({ businessId: business, created: false })).toEqual({ ok: true, value: { businessId: business, created: false } });
    expect(parseOrganisationLinkAnswer({ businessId: business, created: "no" }).ok).toBe(false);
  });
});

describe("constants", () => {
  it("backoff is 1 min, 5 min, 30 min, 2 h, 12 h, 24 h", () => {
    expect([...DELIVERY_BACKOFF_SECONDS]).toEqual([60, 300, 1800, 7200, 43200, 86400]);
  });
});

describe("business.renamed", () => {
  const message = (over: Record<string, unknown> = {}) => ({ version: PLATFORM_CONTRACT_VERSION, messageId: newId("command"), type: "business.renamed", productKey: "caterly", businessId: business, businessName: "  Asha Catering ", nameVersion: 1_700_000_000_000, ...over });

  it("reads a good message and trims the name", () => {
    const r = parseBusinessRenamed(message());
    expect(r.ok && r.value.businessName).toBe("Asha Catering");
  });

  it("refuses an empty or over-long name, a bad version, and a wrong type or id", () => {
    for (const bad of [{ businessName: "  " }, { businessName: "x".repeat(121) }, { nameVersion: 0 }, { nameVersion: 1.5 }, { nameVersion: "5" }, { type: "business.created" }, { businessId: "nope" }, { version: 99 }]) {
      expect(parseBusinessRenamed(message(bad)).ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it("reads the answer", () => {
    expect(parseBusinessRenamedAnswer({ businessId: business, changed: false }).ok).toBe(true);
    expect(parseBusinessRenamedAnswer({ businessId: business }).ok).toBe(false);
  });
});
