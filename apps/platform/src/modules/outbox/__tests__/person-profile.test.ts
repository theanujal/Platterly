import { beforeEach, describe, expect, it, vi } from "vitest";

const enqueue = vi.fn<(tx: unknown, input: unknown) => Promise<{ eventId: string; sequence: bigint }>>(async () => ({ eventId: "e", sequence: BigInt(1) }));
const findSlots = vi.fn();
const platformUser = vi.fn();
vi.mock("@/lib/db", () => ({ prisma: { membershipProductSlot: { findMany: (...a: unknown[]) => findSlots(...a) }, $transaction: async (fn: (tx: unknown) => unknown) => fn({}) } }));
vi.mock("../enqueue", () => ({ enqueueOutbox: (tx: unknown, input: unknown) => enqueue(tx, input) }));
vi.mock("../../users/email-sync", () => ({ platformUserIdForSubject: (...a: unknown[]) => platformUser(...a) }));
vi.mock("../../auth/identity-db", () => ({ identityPool: () => ({}) }));
vi.mock("../../auth/config", () => ({ accountOrigin: () => "http://account.test" }));
vi.mock("../../account/photo-link", () => ({ photoLinkUrl: (origin: string, id: string, v: string) => `${origin}/photo/${id}/${v}` }));
const getProfile = vi.fn();
vi.mock("../../account/profile", () => ({ getProfile: (...a: unknown[]) => getProfile(...a) }));

import { emitCurrentPersonProfile, emitPersonProfile } from "../person-profile";

const profile = { firstName: "Asha", lastName: "Rao", phone: "+919876543210", email: "asha@example.com" };
beforeEach(() => vi.clearAllMocks());

describe("person.profile emitter", () => {
  it("queues one event per product seat, carrying both ids and the details, nothing else", async () => {
    platformUser.mockResolvedValue("user-1");
    findSlots.mockResolvedValue([{ organisationId: "biz_a", productKey: "caterly" }, { organisationId: "biz_a", productKey: "rivo" }]);
    expect(await emitPersonProfile("sub-1", profile)).toBe(2);
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(enqueue.mock.calls[0][1]).toEqual({ organisationId: "biz_a", productKey: "caterly", eventType: "person.profile", payload: { userId: "user-1", subject: "sub-1", ...profile } });
    expect((enqueue.mock.calls[1][1] as { productKey: string }).productKey).toBe("rivo");
  });

  it("queues nothing for a person with no Platform user or no seat", async () => {
    platformUser.mockResolvedValue(null);
    expect(await emitPersonProfile("sub-x", profile)).toBe(0);
    platformUser.mockResolvedValue("user-2");
    findSlots.mockResolvedValue([]);
    expect(await emitPersonProfile("sub-y", profile)).toBe(0);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("carries the photo address when the person has a photo and an empty one when they have none or removed it", async () => {
    platformUser.mockResolvedValue("user-1");
    findSlots.mockResolvedValue([{ organisationId: "biz_a", productKey: "caterly" }]);
    getProfile.mockResolvedValue({ ...profile, photoVersion: "123" });
    await emitCurrentPersonProfile("sub-1");
    expect((enqueue.mock.calls[0][1] as { payload: { picture: string } }).payload.picture).toBe("http://account.test/photo/sub-1/123");
    getProfile.mockResolvedValue({ ...profile, photoVersion: null });
    await emitCurrentPersonProfile("sub-1");
    expect((enqueue.mock.calls[1][1] as { payload: { picture: string } }).payload.picture).toBe("");
  });

  it("the route helper reads the current details, skips a person with no name, and never throws", async () => {
    platformUser.mockResolvedValue("user-1");
    findSlots.mockResolvedValue([{ organisationId: "biz_a", productKey: "caterly" }]);
    getProfile.mockResolvedValue({ ...profile });
    await emitCurrentPersonProfile("sub-1");
    expect(enqueue).toHaveBeenCalledTimes(1);
    getProfile.mockResolvedValue({ ...profile, firstName: " " });
    await emitCurrentPersonProfile("sub-1");
    expect(enqueue).toHaveBeenCalledTimes(1);
    enqueue.mockRejectedValueOnce(new Error("db down"));
    getProfile.mockResolvedValue({ ...profile });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(emitCurrentPersonProfile("sub-1")).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
