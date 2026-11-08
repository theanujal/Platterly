import { describe, expect, it, vi } from "vitest";
import { newId, signedHeaders } from "@platterly/contract";
import { parsePlatformEvent, verifyPlatformRequest } from "@platterly/platform-contract";
import type { DeliverableEvent } from "../deliver";
import { createSender, wireEventId } from "../sender";

const OUT = "plsec_out_test";
const IN = "plsec_in_test";
const OLD_IN = "plsec_in_old";
const BASE = "http://catering.localhost:3000";
const UUID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

const event = (over: Partial<DeliverableEvent> = {}): DeliverableEvent => ({
  id: "row", eventId: UUID, organisationId: newId("business"), productKey: "caterly", eventType: "person.profile", sequence: BigInt(3), attempts: 1, createdAt: new Date("2026-11-08T10:00:00Z"),
  payload: { userId: "u1", subject: "s1", firstName: "Asha", lastName: "Rao", phone: "+919876543210", email: "asha@example.com" }, ...over,
});
const registry = (status = "current") => ({
  integration: async (key: string) => (key === "caterly" ? { key, name: "Caterly", baseUrl: BASE, status } : null),
  secrets: async (key: string, d: "outbound" | "inbound") => (key !== "caterly" ? null : d === "outbound" ? { current: OUT, previous: null } : { current: IN, previous: OLD_IN }),
});
const answer = (body: unknown, secret = IN, status = 200) => {
  const text = JSON.stringify(body);
  return new Response(text, { status, headers: signedHeaders(secret, newId("command"), text) });
};

describe("membership events get the person's identity id when sent", () => {
  const membership = (): DeliverableEvent => event({ eventType: "membership.changed", payload: { userId: "plat-1", role: "admin", status: "active", membershipVersion: 1 } });
  const identities = (subject: string | null) => ({ subjectFor: async () => subject });
  it("adds subject at send time", async () => {
    const bodies: string[] = [];
    const f = (async (_u: unknown, init?: RequestInit) => { bodies.push(String(init!.body)); return answer({ status: "ok" }); }) as unknown as typeof fetch;
    expect(await createSender({ registry: registry(), identities: identities("sub-9"), fetch: f })(membership())).toEqual({ ok: true });
    expect(JSON.parse(bodies[0]).data).toEqual({ userId: "plat-1", subject: "sub-9", role: "admin", status: "active", membershipVersion: 1 });
  });
  it("keeps a subject already there and fails the attempt when the person has no identity", async () => {
    const fetchMock = vi.fn();
    const none = await createSender({ registry: registry(), identities: identities(null), fetch: fetchMock as unknown as typeof fetch })(membership());
    expect(none).toMatchObject({ ok: false, error: expect.stringContaining("no sign-in identity") });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("wireEventId", () => {
  it("is the contract's evt_ id, the same for the same row", () => {
    expect(wireEventId(UUID)).toBe("evt_0a1b2c3d4e5f4a6b8c7d9e0f1a2b3c4d");
    expect(wireEventId(UUID)).toBe(wireEventId(UUID.toUpperCase()));
  });
});

describe("signed sender", () => {
  it("posts a valid event to the product's events route, signed for that route with the outbound secret", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init! });
      return answer({ status: "ok", applied: true });
    });
    const ev = event();
    const result = await createSender({ registry: registry(), fetch: fetchMock as unknown as typeof fetch })(ev);
    expect(result).toEqual({ ok: true });
    const { url, init } = calls[0];
    expect(url).toBe(`${BASE}/api/platform/events`);
    const body = String(init.body);
    expect(verifyPlatformRequest([OUT], init.headers as Record<string, string>, body, "POST", url).ok).toBe(true);
    expect(verifyPlatformRequest(["wrong"], init.headers as Record<string, string>, body, "POST", url).ok).toBe(false);
    // Bound to the route: the same signature does not pass for another path.
    expect(verifyPlatformRequest([OUT], init.headers as Record<string, string>, body, "POST", `${BASE}/api/platform/commands`).ok).toBe(false);
    const parsed = parsePlatformEvent(JSON.parse(body));
    expect(parsed.ok && parsed.value).toMatchObject({ eventId: wireEventId(UUID), businessId: ev.organisationId, sequence: 3, type: "person.profile", occurredAt: "2026-11-08T10:00:00.000Z" });
    expect((init.headers as Record<string, string>)["x-platterly-event-id"]).toBe(wireEventId(UUID));
  });

  it("sends the same body and event id on a retry", async () => {
    const bodies: string[] = [];
    const sender = createSender({ registry: registry(), fetch: (async (_u: unknown, init?: RequestInit) => { bodies.push(String(init!.body)); return answer({ status: "ok" }); }) as unknown as typeof fetch });
    const ev = event();
    await sender(ev);
    await sender({ ...ev, attempts: 2 });
    expect(bodies[0]).toBe(bodies[1]);
  });

  it("refuses an unregistered product and one whose status is not current, without sending anything", async () => {
    const fetchMock = vi.fn();
    const f = fetchMock as unknown as typeof fetch;
    expect(await createSender({ registry: registry(), fetch: f })(event({ productKey: "nope" }))).toEqual({ ok: false, error: "product nope is not registered" });
    for (const status of ["suspended", "retired", "pending"]) {
      const r = await createSender({ registry: registry(status), fetch: f })(event());
      expect(r).toEqual({ ok: false, error: `product caterly is ${status}, not current` });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails an attempt (to be retried) when the product answers an error, cannot be reached, or times out", async () => {
    const status = await createSender({ registry: registry(), fetch: (async () => answer({ error: "x" }, IN, 503)) as unknown as typeof fetch })(event());
    expect(status).toEqual({ ok: false, error: "caterly answered 503" });
    const down = await createSender({ registry: registry(), fetch: (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch })(event());
    expect(down).toMatchObject({ ok: false, error: expect.stringContaining("could not reach caterly: ECONNREFUSED") });
  });

  it("does not count a 200 that the product did not sign (or signed with the wrong secret)", async () => {
    const unsigned = await createSender({ registry: registry(), fetch: (async () => new Response(JSON.stringify({ status: "ok" }), { status: 200 })) as unknown as typeof fetch })(event());
    expect(unsigned).toMatchObject({ ok: false, error: expect.stringContaining("not signed correctly") });
    const wrong = await createSender({ registry: registry(), fetch: (async () => answer({ status: "ok" }, "plsec_attacker")) as unknown as typeof fetch })(event());
    expect(wrong.ok).toBe(false);
  });

  it("accepts an answer signed with the previous inbound secret during a rotation", async () => {
    const r = await createSender({ registry: registry(), fetch: (async () => answer({ status: "ok" }, OLD_IN)) as unknown as typeof fetch })(event());
    expect(r).toEqual({ ok: true });
  });

  it("refuses an event the contract would not accept, without sending it", async () => {
    const fetchMock = vi.fn();
    const r = await createSender({ registry: registry(), fetch: fetchMock as unknown as typeof fetch })(event({ eventType: "person.profile", payload: { userId: "u1" } }));
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("event is not valid") });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
