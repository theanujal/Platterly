import { describe, expect, it } from "vitest";
import { PAYMENT_WINDOW_MS, abandonPaidSignup, completePaidSignup, sweepPaidSignups, type OpsState, type PaidSignupDeps, type PendingSignup } from "../paid-signup";

const NOW = new Date("2026-11-14T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const pending = (subject: string, verifiedHoursAgo: number | null): PendingSignup => ({
  subject, productKey: "caterly", planCode: "premium", interval: "ANNUAL", reservedBusinessId: `biz_${subject.padEnd(32, "a").slice(0, 32)}`, email: `${subject}@x.test`, name: "Asha Rao", phone: "+919800000123",
  signedUpAt: hoursAgo((verifiedHoursAgo ?? 1) + 1), verifiedAt: verifiedHoursAgo === null ? null : hoursAgo(verifiedHoursAgo),
});

/** Stand-ins that record what was done, so a test can say what must NOT have happened. */
function world(rows: PendingSignup[], opsState: Record<string, OpsState>, abandonResult: "ok" | "has_payment" | "failed" = "ok", completeFails = false) {
  const log: string[] = [];
  const live = new Map(rows.map((r) => [r.subject, r]));
  const deps: PaidSignupDeps = {
    prisma: {} as PaidSignupDeps["prisma"],
    store: {
      find: async (s) => live.get(s) ?? null,
      list: async () => [...live.values()],
      markCompleted: async (s) => { log.push(`completed:${s}`); live.delete(s); },
      deleteIdentity: async (s) => { log.push(`identity-deleted:${s}`); live.delete(s); },
    },
    ops: {
      state: async (p) => opsState[p.subject] ?? { unknown: true },
      abandon: async (p, step) => { log.push(`ops-abandon:${p.subject}:${step}`); return abandonResult; },
    },
    purgeUser: async (s) => { log.push(`user-purged:${s}`); return true; },
    completeBusiness: async (p) => { log.push(`business-made:${p.subject}`); return completeFails ? { ok: false, reason: "x" } : { ok: true }; },
  };
  return { deps, log };
}

describe("paid sign-up: completing and abandoning", () => {
  it("a paid sign-up is completed, never abandoned, even long after the window", async () => {
    const w = world([pending("paid1", 100)], { paid1: { paid: true } });
    expect(await sweepPaidSignups(w.deps, NOW)).toEqual({ completed: 1, abandoned: 0, waiting: 0 });
    expect(w.log).toEqual(["business-made:paid1", "completed:paid1"]);
  });

  it("an unpaid sign-up inside the window waits and nothing is removed", async () => {
    const w = world([pending("wait1", 3)], { wait1: { paid: false, step: "opened_store" } });
    expect(await sweepPaidSignups(w.deps, NOW)).toEqual({ completed: 0, abandoned: 0, waiting: 1 });
    expect(w.log).toEqual([]);
  });

  it("an unpaid sign-up past the window is abandoned: Ops keeps the record, then the user and identity are removed", async () => {
    const w = world([pending("gone1", PAYMENT_WINDOW_MS / 3_600_000 + 1)], { gone1: { paid: false, step: "payment_failed" } });
    expect(await sweepPaidSignups(w.deps, NOW)).toEqual({ completed: 0, abandoned: 1, waiting: 0 });
    expect(w.log).toEqual(["ops-abandon:gone1:payment_failed", "user-purged:gone1", "identity-deleted:gone1"]);
  });

  it("when Ops cannot be asked, nothing is decided or removed", async () => {
    const w = world([pending("unk1", 100)], {});
    expect(await sweepPaidSignups(w.deps, NOW)).toEqual({ completed: 0, abandoned: 0, waiting: 1 });
    expect(w.log).toEqual([]);
  });

  it("if Ops finds a plan or a paid payment at the moment of abandoning, the sign-up is completed and nothing is removed", async () => {
    const w = world([pending("race1", 100)], { race1: { paid: false, step: "payment_started" } }, "has_payment");
    expect(await abandonPaidSignup(w.deps, "race1")).toBe("completed");
    expect(w.log).toEqual(["ops-abandon:race1:payment_started", "business-made:race1", "completed:race1"]);
  });

  it("if Ops fails to record the abandoned order, the person's records stay", async () => {
    const w = world([pending("fail1", 100)], { fail1: { paid: false, step: "verified" } }, "failed");
    expect(await abandonPaidSignup(w.deps, "fail1")).toBe("unknown");
    expect(w.log).toEqual(["ops-abandon:fail1:verified"]);
  });

  it("a business that could not be made is not marked completed, so the next check tries again", async () => {
    const w = world([pending("mk1", 100)], { mk1: { paid: true } }, "ok", true);
    expect(await completePaidSignup(w.deps, "mk1")).toBe("unknown");
    expect(w.log).toEqual(["business-made:mk1"]);
  });

  it("a person with no pending row is left alone", async () => {
    const w = world([], {});
    expect(await abandonPaidSignup(w.deps, "nobody")).toBe("gone");
    expect(await completePaidSignup(w.deps, "nobody")).toBe("gone");
  });
});
