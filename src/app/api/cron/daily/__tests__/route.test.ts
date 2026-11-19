import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The jobs are mocked; prisma stays real, so the run lock is the database's own (#121).
vi.mock("@/modules/notifications/triggers", () => ({ runDueNotifications: vi.fn() }));
vi.mock("@/modules/expenses/recurring", () => ({ generateDueRecurringExpenses: vi.fn() }));
vi.mock("@/modules/storefront-visits/visits", () => ({ scrubOldVisits: vi.fn() }));
vi.mock("@/modules/ops-link/events", () => ({ runOpsLinkJobs: vi.fn() }));
vi.mock("@/modules/platform-link/outbox", () => ({ runDuePlatformOutbox: vi.fn() }));
vi.mock("@/modules/platform-link/pull", () => ({ runDuePlatformPull: vi.fn() }));
vi.mock("@/modules/library/scan", () => ({ runLibraryScanIfDue: vi.fn() }));

import { prisma } from "@/lib/db";
import { runDueNotifications } from "@/modules/notifications/triggers";
import { generateDueRecurringExpenses } from "@/modules/expenses/recurring";
import { scrubOldVisits } from "@/modules/storefront-visits/visits";
import { runOpsLinkJobs } from "@/modules/ops-link/events";
import { runDuePlatformOutbox } from "@/modules/platform-link/outbox";
import { runDuePlatformPull } from "@/modules/platform-link/pull";
import { runLibraryScanIfDue } from "@/modules/library/scan";
import { GET } from "../route";

const req = () => new Request("http://catering.localhost/api/cron/daily", { headers: { authorization: "Bearer t" } });

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "t");
  vi.mocked(runDueNotifications).mockResolvedValue({ sent: 0 } as never);
  vi.mocked(generateDueRecurringExpenses).mockResolvedValue(0);
  vi.mocked(scrubOldVisits).mockResolvedValue(0);
  vi.mocked(runOpsLinkJobs).mockResolvedValue(null as never);
  vi.mocked(runDuePlatformOutbox).mockResolvedValue(0);
  vi.mocked(runDuePlatformPull).mockResolvedValue({ checked: 0, repaired: 0, failed: 0 });
  vi.mocked(runLibraryScanIfDue).mockResolvedValue({ ran: false, scanned: 0, candidates: 0 });
  vi.spyOn(prisma.recurringExpense, "findMany").mockResolvedValue([] as never);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("daily cron: one run at a time (#121)", () => {
  it("a second run while the first is busy answers busy and sends nothing", async () => {
    let release!: () => void;
    vi.mocked(runDueNotifications).mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve({ sent: 1 } as never))));
    const first = GET(req());
    await vi.waitFor(() => expect(runDueNotifications).toHaveBeenCalledTimes(1));
    const second = await GET(req());
    expect(await second.json()).toEqual({ busy: true });
    expect(runDueNotifications).toHaveBeenCalledTimes(1);
    release();
    const done = await first;
    expect(done.status).toBe(200);
    expect(await done.json()).toHaveProperty("notifications");
  });

  it("a run that throws frees the lock for the next one", async () => {
    vi.mocked(runDueNotifications).mockRejectedValueOnce(new Error("boom"));
    await expect(GET(req())).rejects.toThrow("boom");
    const next = await GET(req());
    expect(await next.json()).not.toHaveProperty("busy");
  });
});

