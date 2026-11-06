import { describe, expect, it, vi } from "vitest";
import { OutboxInputError, OutboxOrganisationNotFoundError, allocateOutboxSequence, enqueueOutbox, type OutboxTx } from "../enqueue";

const ORG = "biz_" + "b".repeat(32);
function fakeTx(start = BigInt(0)) {
  let seq = start;
  const update = vi.fn(async () => ({ outboxSequence: ++seq }));
  const create = vi.fn(async () => ({ id: "row" }));
  return { tx: { organisation: { update }, outboxEvent: { create } } as unknown as OutboxTx, update, create };
}

describe("allocateOutboxSequence", () => {
  it("increments the organisation's counter and returns the new value", async () => {
    const { tx, update } = fakeTx(BigInt(4));
    expect(await allocateOutboxSequence(tx, ORG)).toBe(BigInt(5));
    expect(update).toHaveBeenCalledWith({ where: { id: ORG }, data: { outboxSequence: { increment: 1 } }, select: { outboxSequence: true } });
  });
  it("names a missing organisation", async () => {
    const tx = { organisation: { update: vi.fn().mockRejectedValue(Object.assign(new Error("x"), { code: "P2025" })) } } as unknown as OutboxTx;
    await expect(allocateOutboxSequence(tx, ORG)).rejects.toBeInstanceOf(OutboxOrganisationNotFoundError);
  });
  it("lets any other database error through", async () => {
    const tx = { organisation: { update: vi.fn().mockRejectedValue(new Error("down")) } } as unknown as OutboxTx;
    await expect(allocateOutboxSequence(tx, ORG)).rejects.toThrow("down");
  });
});

describe("enqueueOutbox", () => {
  const event = { organisationId: ORG, productKey: "alpha", eventType: "membership.changed", payload: { membershipVersion: 3 } };

  it("allocates a sequence, then inserts the event with it", async () => {
    const { tx, update, create } = fakeTx();
    const out = await enqueueOutbox(tx, event);
    expect(out.sequence).toBe(BigInt(1));
    expect(update).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({ data: { eventId: out.eventId, organisationId: ORG, productKey: "alpha", eventType: "membership.changed", payload: { membershipVersion: 3 }, sequence: BigInt(1) }, select: { id: true } });
    expect(out.eventId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("one allocation can serve several products (same sequence, different event ids)", async () => {
    const { tx, update, create } = fakeTx();
    const sequence = await allocateOutboxSequence(tx, ORG);
    const a = await enqueueOutbox(tx, { ...event, productKey: "alpha", sequence });
    const b = await enqueueOutbox(tx, { ...event, productKey: "beta", sequence });
    expect(update).toHaveBeenCalledTimes(1);
    expect(a.sequence).toBe(b.sequence);
    expect(a.eventId).not.toBe(b.eventId);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("consecutive calls get consecutive sequences", async () => {
    const { tx } = fakeTx();
    const a = await enqueueOutbox(tx, event);
    const b = await enqueueOutbox(tx, event);
    expect([a.sequence, b.sequence]).toEqual([BigInt(1), BigInt(2)]);
  });

  it("refuses a payload with a sensitive key, and a non-positive sequence, before touching the database", async () => {
    const { tx, update, create } = fakeTx();
    await expect(enqueueOutbox(tx, { ...event, payload: { inner: { accessToken: "x" } } })).rejects.toBeInstanceOf(OutboxInputError);
    await expect(enqueueOutbox(tx, { ...event, sequence: BigInt(0) })).rejects.toBeInstanceOf(OutboxInputError);
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});
