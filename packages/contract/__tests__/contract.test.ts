import { describe, expect, it } from "vitest";
import {
  CONTRACT_VERSION,
  DELETE_RETENTION_DAYS,
  GRACE_DAYS,
  REPORT_LIMITS,
  parseReportDoc,
  evaluateAccess,
  getLimit,
  isFlagOn,
  isId,
  isNewerSnapshot,
  isWithinLimit,
  newId,
  parseBuyer,
  parseCheckoutRequest,
  parseCommand,
  parseDowngradeRequest,
  parseEvent,
  parseManifest,
  parseSnapshot,
  parseVerifyRequest,
  signBody,
  signedHeaders,
  verifyRequest,
  type EntitlementSnapshot,
} from "../index";

const NOW = 1_790_000_000;
const SECRET = "whsec_test_secret";

const manifest = {
  contract: 1,
  productKey: "catering",
  name: "Catering",
  version: "2026.10.05",
  baseUrl: "https://catering.platterly.in",
  entitlements: [
    { key: "maxCustomers", type: "limit", label: "Customers" },
    { key: "multiLocation", type: "flag", label: "Multiple locations" },
    { key: "supportTier", type: "text", label: "Support" },
  ],
  trial: { days: 7, entitlements: { maxCustomers: 50, multiLocation: false } },
  events: ["business.signed_up"],
  messageTemplates: ["welcome_owner"],
  tabs: [{ key: "overview", label: "Overview" }],
  actions: ["suspend"],
  reports: [{ key: "sales", label: "Sales" }],
};

function snapshot(over: Partial<EntitlementSnapshot> = {}): EntitlementSnapshot {
  return {
    businessId: newId("business"),
    productKey: "catering",
    subscriptionId: newId("subscription"),
    version: 3,
    plan: { code: "pro", name: "Pro" },
    status: "ACTIVE",
    interval: "MONTHLY",
    currentPeriodEnd: "2026-11-05T00:00:00.000Z",
    trialEndsAt: null,
    entitlements: { maxCustomers: 100, multiLocation: true },
    issuedAt: "2026-10-05T09:00:00.000Z",
    validUntil: "2026-10-12T09:00:00.000Z",
    ...over,
  };
}

describe("ids", () => {
  it("makes prefixed, unique ids and recognises only its own kind", () => {
    const a = newId("business");
    expect(a).toMatch(/^biz_[0-9a-f]{32}$/);
    expect(newId("business")).not.toBe(a);
    expect(isId("business", a)).toBe(true);
    expect(isId("event", a)).toBe(false);
    expect(isId("business", "biz_nope")).toBe(false);
  });
});

describe("signing", () => {
  const body = JSON.stringify({ hello: "world" });

  it("round-trips, and gives the same signature scheme as the Chunk 25 webhooks", () => {
    const headers = signedHeaders(SECRET, newId("event"), body, NOW);
    expect(headers["x-platterly-signature"]).toBe(signBody(SECRET, NOW, body));
    expect(headers["x-platterly-contract"]).toBe(String(CONTRACT_VERSION));
    const result = verifyRequest([SECRET], headers, body, NOW);
    expect(result.ok).toBe(true);
  });

  it("accepts a header bag with a Headers object too", () => {
    const headers = new Headers(signedHeaders(SECRET, newId("event"), body, NOW));
    expect(verifyRequest([SECRET], headers, body, NOW).ok).toBe(true);
  });

  it("rejects a changed body, a wrong secret and missing headers", () => {
    const headers = signedHeaders(SECRET, newId("event"), body, NOW);
    expect(verifyRequest([SECRET], headers, body + " ", NOW)).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifyRequest(["other"], headers, body, NOW)).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifyRequest([SECRET], {}, body, NOW)).toEqual({ ok: false, reason: "missing_headers" });
    expect(verifyRequest([], headers, body, NOW)).toEqual({ ok: false, reason: "no_secret" });
    expect(verifyRequest([""], headers, body, NOW)).toEqual({ ok: false, reason: "no_secret" });
  });

  it("rejects a stale or malformed timestamp (replay protection)", () => {
    const headers = signedHeaders(SECRET, newId("event"), body, NOW);
    expect(verifyRequest([SECRET], headers, body, NOW + 301)).toEqual({ ok: false, reason: "stale_timestamp" });
    expect(verifyRequest([SECRET], headers, body, NOW - 301)).toEqual({ ok: false, reason: "stale_timestamp" });
    expect(verifyRequest([SECRET], headers, body, NOW + 299).ok).toBe(true);
    expect(verifyRequest([SECRET], { ...headers, "x-platterly-timestamp": "abc" }, body, NOW)).toEqual({ ok: false, reason: "bad_timestamp" });
  });

  it("accepts either secret during a rotation", () => {
    const old = signedHeaders("old-secret", newId("event"), body, NOW);
    const fresh = signedHeaders("new-secret", newId("event"), body, NOW);
    expect(verifyRequest(["new-secret", "old-secret"], old, body, NOW).ok).toBe(true);
    expect(verifyRequest(["new-secret", "old-secret"], fresh, body, NOW).ok).toBe(true);
    expect(verifyRequest(["new-secret"], old, body, NOW).ok).toBe(false);
  });
});

describe("manifest", () => {
  it("parses a valid manifest", () => {
    const parsed = parseManifest(manifest);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.entitlements).toHaveLength(3);
      expect(parsed.value.trial.entitlements).toEqual({ maxCustomers: 50, multiLocation: false });
    }
  });

  it.each([
    ["another contract version", { ...manifest, contract: 2 }],
    ["a bad product key", { ...manifest, productKey: "Catering!" }],
    ["a duplicate entitlement", { ...manifest, entitlements: [manifest.entitlements[0], manifest.entitlements[0]] }],
    ["an unknown entitlement type", { ...manifest, entitlements: [{ key: "x", type: "money", label: "X" }] }],
    ["trial defaults with an unknown key", { ...manifest, trial: { days: 7, entitlements: { nope: 1 } } }],
    ["trial defaults of the wrong type", { ...manifest, trial: { days: 7, entitlements: { multiLocation: "yes" } } }],
    ["a negative limit", { ...manifest, trial: { days: 7, entitlements: { maxCustomers: -1 } } }],
    ["a non-http base URL", { ...manifest, baseUrl: "ftp://x" }],
  ])("rejects %s", (_name, input) => {
    expect(parseManifest(input).ok).toBe(false);
  });
});

describe("snapshot", () => {
  const parsedManifest = parseManifest(manifest);
  if (!parsedManifest.ok) throw new Error(parsedManifest.error);
  const defs = parsedManifest.value.entitlements;

  it("parses and checks entitlements against the manifest", () => {
    expect(parseSnapshot(snapshot(), defs).ok).toBe(true);
    expect(parseSnapshot(snapshot({ entitlements: { surprise: 1 } }), defs).ok).toBe(false);
    expect(parseSnapshot(snapshot({ entitlements: { maxCustomers: "many" as never } }), defs).ok).toBe(false);
  });

  it("rejects bad shapes", () => {
    expect(parseSnapshot(null).ok).toBe(false);
    expect(parseSnapshot({ ...snapshot(), businessId: "x" }).ok).toBe(false);
    expect(parseSnapshot({ ...snapshot(), status: "PAUSED" }).ok).toBe(false);
    expect(parseSnapshot({ ...snapshot(), version: 0 }).ok).toBe(false);
    expect(parseSnapshot({ ...snapshot(), validUntil: "2026-10-01T00:00:00.000Z" }).ok).toBe(false);
  });

  it("only a higher version replaces the stored one", () => {
    expect(isNewerSnapshot({ version: 4 }, { version: 3 })).toBe(true);
    expect(isNewerSnapshot({ version: 3 }, { version: 3 })).toBe(false);
    expect(isNewerSnapshot({ version: 2 }, { version: 3 })).toBe(false);
    expect(isNewerSnapshot({ version: 1 }, null)).toBe(true);
  });
});

describe("access rules", () => {
  const valid = Date.parse("2026-10-12T09:00:00.000Z");
  const at = (offsetMs: number) => new Date(valid + offsetMs);
  const DAY = 86_400_000;

  it("blocks when there is no snapshot", () => {
    expect(evaluateAccess(null)).toEqual({ allowed: false, reason: "missing" });
  });

  it("allows an in-date snapshot", () => {
    expect(evaluateAccess(snapshot(), at(-DAY))).toEqual({ allowed: true, stale: false });
    expect(evaluateAccess(snapshot({ status: "TRIALING" }), at(0))).toEqual({ allowed: true, stale: false });
    expect(evaluateAccess(snapshot({ status: "PAST_DUE" }), at(-DAY))).toEqual({ allowed: true, stale: false });
  });

  it("keeps working in grace (5 days) when ops is silent, then locks", () => {
    expect(GRACE_DAYS).toBe(5);
    expect(evaluateAccess(snapshot(), at(DAY))).toEqual({ allowed: true, stale: true });
    expect(evaluateAccess(snapshot(), at(5 * DAY))).toEqual({ allowed: true, stale: true });
    expect(evaluateAccess(snapshot(), at(5 * DAY + 1))).toEqual({ allowed: false, reason: "expired" });
  });

  it("an explicit lock or cancel applies at once, grace never softens it", () => {
    expect(evaluateAccess(snapshot({ status: "LOCKED" }), at(-DAY))).toEqual({ allowed: false, reason: "locked" });
    expect(evaluateAccess(snapshot({ status: "CANCELLED" }), at(-DAY))).toEqual({ allowed: false, reason: "cancelled" });
  });

  it("locks by the snapshot's own dates (trial end, period end) with no help from ops, and a missing date never locks", () => {
    const t = Date.parse("2026-10-12T09:00:00.000Z");
    const at = (offset: number) => new Date(t + offset);
    const trial = snapshot({ status: "TRIALING", trialEndsAt: new Date(t).toISOString(), currentPeriodEnd: null, validUntil: new Date(t + 30 * DAY).toISOString() });
    expect(evaluateAccess(trial, at(-1))).toEqual({ allowed: true, stale: false });
    expect(evaluateAccess(trial, at(0))).toEqual({ allowed: false, reason: "trial_ended" });
    const paid = snapshot({ status: "ACTIVE", currentPeriodEnd: new Date(t).toISOString(), validUntil: new Date(t + 30 * DAY).toISOString() });
    expect(evaluateAccess(paid, at(-1))).toEqual({ allowed: true, stale: false });
    expect(evaluateAccess(paid, at(0))).toEqual({ allowed: false, reason: "period_ended" });
    // An active kitchen whose plan has no period end (assigned by hand) never locks by date; a trial date does not lock a paid plan.
    expect(evaluateAccess(snapshot({ status: "ACTIVE", currentPeriodEnd: null, validUntil: new Date(t + 30 * DAY).toISOString() }), at(5 * DAY))).toEqual({ allowed: true, stale: false });
    expect(evaluateAccess(snapshot({ status: "ACTIVE", trialEndsAt: new Date(t - DAY).toISOString(), currentPeriodEnd: null, validUntil: new Date(t + 30 * DAY).toISOString() }), at(0)).allowed).toBe(true);
  });

  it("limits and flags read from the snapshot (null is unlimited, a missing key blocks nothing)", () => {
    const s = snapshot({ entitlements: { maxCustomers: 2, maxOrders: null, multiLocation: true, supportTier: "gold" } });
    expect(getLimit(s, "maxCustomers")).toBe(2);
    expect(getLimit(s, "maxOrders")).toBeNull();
    expect(getLimit(s, "absent")).toBeUndefined();
    expect(getLimit(s, "supportTier")).toBeUndefined();
    expect(isWithinLimit(s, "maxCustomers", 1)).toBe(true);
    expect(isWithinLimit(s, "maxCustomers", 2)).toBe(false);
    expect(isWithinLimit(s, "maxOrders", 1_000_000)).toBe(true);
    expect(isWithinLimit(s, "absent", 5)).toBe(true);
    expect(isFlagOn(s, "multiLocation")).toBe(true);
    expect(isFlagOn(s, "absent")).toBe(false);
    expect(isFlagOn(null, "multiLocation")).toBe(false);
  });
});

describe("commands", () => {
  const businessId = newId("business");
  const base = { commandId: newId("command"), businessId };

  it("parses provision and refuses a snapshot for another business", () => {
    const good = parseCommand({ ...base, type: "business.provision", payload: { businessName: "Spice Co", ownerEmail: "o@x.in", ownerName: "Asha", snapshot: snapshot({ businessId }) } });
    expect(good.ok).toBe(true);
    const wrong = parseCommand({ ...base, type: "business.provision", payload: { businessName: "Spice Co", ownerEmail: "o@x.in", ownerName: "Asha", snapshot: snapshot() } });
    expect(wrong).toEqual({ ok: false, error: "snapshot is for another business" });
  });

  it("parses snapshot.push, suspend, reactivate, restore", () => {
    expect(parseCommand({ ...base, type: "snapshot.push", payload: { snapshot: snapshot({ businessId }) } }).ok).toBe(true);
    expect(parseCommand({ ...base, type: "business.suspend", payload: { reason: "non-payment" } }).ok).toBe(true);
    expect(parseCommand({ ...base, type: "business.suspend", payload: {} }).ok).toBe(false);
    expect(parseCommand({ ...base, type: "business.reactivate" }).ok).toBe(true);
    expect(parseCommand({ ...base, type: "business.restore" }).ok).toBe(true);
  });

  it("notice buttons must be a path on the product or an https URL", () => {
    const notice = (buttonUrl: string | null) => parseCommand({ ...base, type: "notice.set", payload: { enabled: true, title: "Hi", message: "m", buttonLabel: "Go", buttonUrl } });
    expect(notice("/settings/subscription").ok).toBe(true);
    expect(notice("https://platterly.in/x").ok).toBe(true);
    expect(notice(null).ok).toBe(true);
    expect(notice("//evil.example").ok).toBe(false);
    expect(notice("http://plain.example").ok).toBe(false);
    expect(notice("javascript:alert(1)").ok).toBe(false);
  });

  it("business.update needs at least one valid field and keeps only known ones", () => {
    const update = (payload: unknown) => parseCommand({ ...base, type: "business.update", payload });
    const ok = update({ businessName: " Spice Co ", slug: "spice-co", junk: 1 });
    expect(ok.ok && ok.value.type === "business.update" && ok.value.payload).toEqual({ businessName: "Spice Co", slug: "spice-co" });
    expect(update({}).ok).toBe(false);
    expect(update({ businessName: "  " }).ok).toBe(false);
    expect(update({ ownerEmail: "no-at-sign" }).ok).toBe(false);
    expect(update({ businessName: 5 }).ok).toBe(false);
    expect(update({ slug: "x".repeat(64) }).ok).toBe(false);
  });

  it("provider.set needs a known channel and a true/false", () => {
    const set = (payload: unknown) => parseCommand({ ...base, type: "provider.set", payload });
    expect(set({ channel: "whatsapp", connected: true }).ok).toBe(true);
    expect(set({ channel: "email", connected: false }).ok).toBe(true);
    expect(set({ channel: "sms", connected: true }).ok).toBe(false);
    expect(set({ channel: "email", connected: "yes" }).ok).toBe(false);
    expect(set({}).ok).toBe(false);
  });

  it("delete needs a typed confirmation and defaults to 30 days' retention", () => {
    expect(DELETE_RETENTION_DAYS).toBe(30);
    const parsed = parseCommand({ ...base, type: "business.delete", payload: { confirmation: "Spice Co" } });
    expect(parsed.ok && parsed.value.type === "business.delete" && parsed.value.payload.retentionDays).toBe(30);
    expect(parseCommand({ ...base, type: "business.delete", payload: {} }).ok).toBe(false);
    expect(parseCommand({ ...base, type: "business.delete", payload: { confirmation: "x", retentionDays: -1 } }).ok).toBe(false);
  });

  it("rejects unknown types and bad ids", () => {
    expect(parseCommand({ ...base, type: "business.explode" }).ok).toBe(false);
    expect(parseCommand({ ...base, commandId: "cmd_1", type: "business.restore" }).ok).toBe(false);
    expect(parseCommand("nope").ok).toBe(false);
  });
});

describe("events", () => {
  const base = { eventId: newId("event"), productKey: "catering", businessId: newId("business"), occurredAt: "2026-10-05T09:00:00.000Z" };

  it("parses each event type", () => {
    expect(parseEvent({ ...base, type: "business.signed_up", data: { businessName: "Spice Co", ownerName: "Asha", ownerEmail: "o@x.in" } }).ok).toBe(true);
    expect(parseEvent({ ...base, type: "usage.reported", data: { periodStart: "2026-10-05T00:00:00.000Z", counts: { customers: 4, orders: 9 } } }).ok).toBe(true);
    expect(parseEvent({ ...base, type: "alert.raised", data: { severity: "warning", code: "low_stock", message: "m" } }).ok).toBe(true);
    expect(parseEvent({ ...base, type: "owner.changed", data: { ownerEmail: "n@x.in" } }).ok).toBe(true);
    expect(parseEvent({ ...base, type: "message.requested", data: { template: "welcome_owner", variables: { name: "Asha", n: 3 } } }).ok).toBe(true);
  });

  it("parses the optional backfill flag on sign-up", () => {
    const data = { businessName: "Spice Co", ownerName: "Asha", ownerEmail: "o@x.in" };
    const parsed = parseEvent({ ...base, type: "business.signed_up", data: { ...data, backfill: true } });
    expect(parsed.ok && parsed.value.type === "business.signed_up" && parsed.value.data.backfill).toBe(true);
    expect(parseEvent({ ...base, type: "business.signed_up", data: { ...data, backfill: "yes" } }).ok).toBe(false);
    const plain = parseEvent({ ...base, type: "business.signed_up", data });
    expect(plain.ok && plain.value.type === "business.signed_up" && "backfill" in plain.value.data).toBe(false);
  });

  it("parses business.updated with only the changed fields, and refuses an empty or blank one", () => {
    expect(parseEvent({ ...base, type: "business.updated", data: { businessName: "New Name" } }).ok).toBe(true);
    expect(parseEvent({ ...base, type: "business.updated", data: { ownerName: "Asha K" } }).ok).toBe(true);
    expect(parseEvent({ ...base, type: "business.updated", data: {} }).ok).toBe(false);
    expect(parseEvent({ ...base, type: "business.updated", data: { businessName: "  " } }).ok).toBe(false);
    expect(parseEvent({ ...base, type: "business.updated", data: { businessName: 5 } }).ok).toBe(false);
  });

  it("rejects bad data", () => {
    expect(parseEvent({ ...base, type: "usage.reported", data: { periodStart: "2026-10-05T00:00:00.000Z", counts: { orders: -1 } } }).ok).toBe(false);
    expect(parseEvent({ ...base, type: "usage.reported", data: { periodStart: "2026-10-05T00:00:00.000Z", counts: { "bad key": 1 } } }).ok).toBe(false);
    expect(parseEvent({ ...base, type: "alert.raised", data: { severity: "fatal", code: "c", message: "m" } }).ok).toBe(false);
    expect(parseEvent({ ...base, type: "message.requested", data: { template: "t", variables: { a: { nested: true } } } }).ok).toBe(false);
    expect(parseEvent({ ...base, type: "nope", data: {} }).ok).toBe(false);
    expect(parseEvent({ ...base, productKey: "Bad Key", type: "owner.changed", data: { ownerEmail: "n@x.in" } }).ok).toBe(false);
  });
});

describe("billing API requests", () => {
  const buyer = { name: " Spice Co ", addressLine1: "1 Main Rd", addressLine2: "", city: "Bengaluru", state: "Karnataka", postalCode: "560001", country: "India", gstin: "29ABCDE1234F1Z5" };

  it("parses a buyer, trimming text and turning blanks into null, and requires a name", () => {
    const parsed = parseBuyer(buyer);
    expect(parsed.ok && parsed.value).toMatchObject({ name: "Spice Co", addressLine2: null, city: "Bengaluru", gstin: "29ABCDE1234F1Z5" });
    expect(parseBuyer({ ...buyer, name: " " }).ok).toBe(false);
    expect(parseBuyer({ ...buyer, city: 5 }).ok).toBe(false);
    expect(parseBuyer({ ...buyer, state: "x".repeat(201) }).ok).toBe(false);
    expect(parseBuyer("no").ok).toBe(false);
    const sparse = parseBuyer({ name: "A" });
    expect(sparse.ok && sparse.value.gstin).toBeNull();
  });

  it("parses a checkout request and refuses a bad interval or a missing plan", () => {
    expect(parseCheckoutRequest({ planId: "plan_1", interval: "ANNUAL", buyer }).ok).toBe(true);
    expect(parseCheckoutRequest({ planId: "plan_1", interval: "WEEKLY", buyer }).ok).toBe(false);
    expect(parseCheckoutRequest({ interval: "MONTHLY", buyer }).ok).toBe(false);
    expect(parseCheckoutRequest({ planId: "plan_1", interval: "MONTHLY", buyer: {} }).ok).toBe(false);
  });

  it("parses a verify request: ids are plain tokens and the signature is 64 hex characters", () => {
    const sig = "a".repeat(64);
    expect(parseVerifyRequest({ razorpayOrderId: "order_Abc123", razorpayPaymentId: "pay_Abc123", signature: sig }).ok).toBe(true);
    expect(parseVerifyRequest({ razorpayOrderId: "order_Abc123", razorpayPaymentId: "pay_Abc123", signature: "short" }).ok).toBe(false);
    expect(parseVerifyRequest({ razorpayOrderId: "../x", razorpayPaymentId: "pay_Abc123", signature: sig }).ok).toBe(false);
    expect(parseVerifyRequest({ razorpayOrderId: "order_Abc123", razorpayPaymentId: "", signature: sig }).ok).toBe(false);
  });

  it("parses a downgrade request", () => {
    expect(parseDowngradeRequest({ planId: "plan_1", interval: "MONTHLY" }).ok).toBe(true);
    expect(parseDowngradeRequest({ planId: "", interval: "MONTHLY" }).ok).toBe(false);
    expect(parseDowngradeRequest({ planId: "plan_1" }).ok).toBe(false);
  });
});

describe("report documents", () => {
  const doc = {
    report: "sales",
    title: "Sales",
    period: { from: "2026-10-01", to: null },
    blocks: [
      { type: "tiles", tiles: [{ label: "Revenue", value: "₹1,000", hint: "Cancelled left out" }, { label: "Orders", value: "4" }] },
      { type: "bars", title: "By month", rows: [{ label: "Oct 2026", value: 1000, text: "₹1,000", sub: "4 orders" }] },
      { type: "table", title: "Kitchens", columns: [{ label: "Kitchen" }, { label: "Revenue", align: "right" }], rows: [["Spice Co", "₹1,000"]] },
      { type: "text", title: "How this is worked out", lines: ["One line."] },
    ],
  };

  it("accepts a well-formed document and keeps only what it knows", () => {
    const parsed = parseReportDoc({ ...doc, extra: 1 });
    expect(parsed.ok && parsed.value).toEqual(doc);
  });

  it("accepts an empty document and a missing period", () => {
    expect(parseReportDoc({ report: "x", title: "X", blocks: [] })).toMatchObject({ ok: true, value: { period: { from: null, to: null } } });
  });

  it("refuses markup-sized or malformed content", () => {
    expect(parseReportDoc("nope").ok).toBe(false);
    expect(parseReportDoc({ ...doc, title: "" }).ok).toBe(false);
    expect(parseReportDoc({ ...doc, blocks: [{ type: "script", src: "x" }] }).ok).toBe(false);
    expect(parseReportDoc({ ...doc, blocks: [{ type: "tiles", tiles: [{ label: "a", value: 5 }] }] }).ok).toBe(false);
    expect(parseReportDoc({ ...doc, blocks: [{ type: "bars", title: "t", rows: [{ label: "a", value: "5", text: "5" }] }] }).ok).toBe(false);
    expect(parseReportDoc({ ...doc, blocks: [{ type: "bars", title: "t", rows: [{ label: "a", value: Infinity, text: "5" }] }] }).ok).toBe(false);
    expect(parseReportDoc({ ...doc, blocks: [{ type: "table", title: "t", columns: [{ label: "a" }, { label: "b" }], rows: [["only one"]] }] }).ok).toBe(false);
    expect(parseReportDoc({ ...doc, blocks: [{ type: "table", title: "t", columns: [{ label: "a", align: "centre" }], rows: [] }] }).ok).toBe(false);
    expect(parseReportDoc({ ...doc, blocks: [{ type: "table", title: "t", columns: [{ label: "a" }], rows: [[5]] }] }).ok).toBe(false);
    expect(parseReportDoc({ ...doc, period: { from: "x".repeat(20) } }).ok).toBe(false);
  });

  it("caps sizes", () => {
    expect(parseReportDoc({ ...doc, blocks: Array.from({ length: REPORT_LIMITS.blocks + 1 }, () => ({ type: "text", title: "t", lines: [] })) }).ok).toBe(false);
    const rows = Array.from({ length: REPORT_LIMITS.rows + 1 }, () => ["a"]);
    expect(parseReportDoc({ ...doc, blocks: [{ type: "table", title: "t", columns: [{ label: "a" }], rows }] }).ok).toBe(false);
    expect(parseReportDoc({ ...doc, blocks: [{ type: "tiles", tiles: [{ label: "a", value: "x".repeat(61) }] }] }).ok).toBe(false);
  });

  it("accepts a chart block and keeps only what it knows", () => {
    const chart = { type: "chart", title: "Sales by month", description: "Rupees", kind: "area", labels: ["Aug", "Sep"], series: [{ name: "Sales", values: [10, 20.5], format: "currency", extra: 1 }], emptyText: "none" };
    const parsed = parseReportDoc({ report: "x", title: "X", blocks: [chart] });
    expect(parsed).toMatchObject({ ok: true });
    expect(parsed.ok && parsed.value.blocks[0]).toEqual({ type: "chart", title: "Sales by month", description: "Rupees", kind: "area", labels: ["Aug", "Sep"], series: [{ name: "Sales", values: [10, 20.5], format: "currency" }], emptyText: "none" });
  });

  it("refuses a malformed or oversized chart", () => {
    const base = { type: "chart", title: "T", kind: "line", labels: ["a", "b"], series: [{ name: "S", values: [1, 2] }] };
    const parse = (over: object) => parseReportDoc({ report: "x", title: "X", blocks: [{ ...base, ...over }] }).ok;
    expect(parse({})).toBe(true);
    expect(parse({ kind: "pie" })).toBe(false);
    expect(parse({ series: [{ name: "S", values: [1] }] })).toBe(false); // one number per label
    expect(parse({ series: [{ name: "S", values: [1, Number.NaN] }] })).toBe(false);
    expect(parse({ series: [{ name: "S", values: ["1", "2"] }] })).toBe(false);
    expect(parse({ series: [] })).toBe(false);
    expect(parse({ series: [{ name: "S", values: [1, 2], format: "percent" }] })).toBe(false);
    expect(parse({ series: Array.from({ length: REPORT_LIMITS.series + 1 }, (_, n) => ({ name: `S${n}`, values: [1, 2] })) })).toBe(false);
    const labels = Array.from({ length: REPORT_LIMITS.points + 1 }, (_, n) => `p${n}`);
    expect(parse({ labels, series: [{ name: "S", values: labels.map(() => 1) }] })).toBe(false);
  });

  it("a manifest may list reports, or none (older manifests stay valid)", () => {
    const withReports = parseManifest(manifest);
    expect(withReports.ok && withReports.value.reports).toEqual([{ key: "sales", label: "Sales" }]);
    const { reports, ...older } = manifest;
    expect(reports).toBeDefined();
    const without = parseManifest(older);
    expect(without.ok && without.value.reports).toEqual([]);
    expect(parseManifest({ ...manifest, reports: [{ key: "bad key", label: "x" }] }).ok).toBe(false);
  });
});
