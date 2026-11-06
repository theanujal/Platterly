import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { REDACTED } from "../redact";
import { AuditInputError, writeAudit, type AuditTx } from "../write-audit";

const fakeTx = () => {
  const create = vi.fn(async () => ({ id: "11111111-1111-4111-8111-111111111111" }));
  return { tx: { auditLog: { create } } as unknown as AuditTx, create };
};
const base = { action: "organisation.created", outcome: "done", initiator: { kind: "user", ref: "u1" }, executor: { kind: "user", ref: "u1" } } as const;

describe("writeAudit", () => {
  it("writes one row through the caller's transaction client and returns its id", async () => {
    const { tx, create } = fakeTx();
    const result = await writeAudit(tx, { ...base, organisationId: "biz_" + "a".repeat(32), subject: { type: "organisation", id: "x" }, requestId: "r1" });
    expect(result).toEqual({ id: "11111111-1111-4111-8111-111111111111" });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]).toMatchObject([{ data: { action: "organisation.created", outcome: "done", initiatorKind: "user", executorRef: "u1", organisationId: "biz_" + "a".repeat(32), subjectType: "organisation", subjectId: "x", requestId: "r1", payload: {} } }]);
  });

  it("allows a null organisation (user-level events)", async () => {
    const { tx, create } = fakeTx();
    await writeAudit(tx, { ...base, action: "user.linked" });
    expect((create.mock.calls[0] as unknown as [{ data: { organisationId: unknown } }])[0].data.organisationId).toBeNull();
  });

  it("redacts sensitive keys in payload, before, after and approval", async () => {
    const { tx, create } = fakeTx();
    await writeAudit(tx, {
      ...base,
      payload: { inviteToken: "t", ok: 1 },
      before: { passwordHash: "h" },
      after: { nested: [{ otp: "1" }] },
      approval: { clientSecret: "s", by: "AJ" },
    });
    const data = (create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(data.payload).toEqual({ inviteToken: REDACTED, ok: 1 });
    expect(data.before).toEqual({ passwordHash: REDACTED });
    expect(data.after).toEqual({ nested: [{ otp: REDACTED }] });
    expect(data.approval).toEqual({ clientSecret: REDACTED, by: "AJ" });
    expect(JSON.stringify(data)).not.toMatch(/"(t|h|s)"|"1"/);
  });

  it("omits before, after and approval when they are not given", async () => {
    const { tx, create } = fakeTx();
    await writeAudit(tx, base);
    const data = (create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect("before" in data || "after" in data || "approval" in data).toBe(false);
  });

  it("a refusal needs a reason code, and an action cannot be blank; nothing is written", async () => {
    const { tx, create } = fakeTx();
    await expect(writeAudit(tx, { ...base, outcome: "refused" })).rejects.toBeInstanceOf(AuditInputError);
    await expect(writeAudit(tx, { ...base, outcome: "refused", reasonCode: " " })).rejects.toBeInstanceOf(AuditInputError);
    await expect(writeAudit(tx, { ...base, action: " " })).rejects.toBeInstanceOf(AuditInputError);
    expect(create).not.toHaveBeenCalled();
    await writeAudit(tx, { ...base, outcome: "refused", reasonCode: "slot_taken" });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("propagates a database failure so the caller's transaction rolls back", async () => {
    const tx = { auditLog: { create: vi.fn().mockRejectedValue(new Error("boom")) } } as unknown as AuditTx;
    await expect(writeAudit(tx, base)).rejects.toThrow("boom");
  });

  it("never opens a transaction or imports the global client", () => {
    for (const file of ["../write-audit.ts", "../../outbox/enqueue.ts"]) {
      const text = readFileSync(path.join(__dirname, file), "utf8");
      expect(text, file).not.toMatch(/\$transaction|@\/lib\/db|lib\/db"/);
    }
  });
});
