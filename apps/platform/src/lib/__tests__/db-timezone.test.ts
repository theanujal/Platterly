import { describe, expect, it } from "vitest";

// The Prisma adapter treats a timestamptz as UTC, so the Platform's connections must run in UTC. On a database whose own time zone is not UTC (a local
// cluster set to Asia/Kolkata, say) every date the app wrote was stored 5 hours 30 minutes early and every date it read came back 5 hours 30 minutes late:
// the app agreed with itself, but anything checked in SQL (now(), a default, a report, a manual fix) was off by that much. Read-only: it only selects.
const MINUTE = 60_000;

describe.skipIf(!process.env.DATABASE_URL)("the Platform's database connection agrees with the database clock", () => {
  it("reads now() as the real current time and writes a date as the same instant", async () => {
    const { prisma } = await import("@/lib/db");
    const sent = new Date();
    const rows = await prisma.$queryRaw<{ now: Date; stored_ms: number }[]>`select now() as now, (extract(epoch from ${sent}::timestamptz) * 1000)::float8 as stored_ms`;
    expect(Math.abs(rows[0].now.getTime() - Date.now())).toBeLessThan(MINUTE);
    expect(Math.abs(rows[0].stored_ms - sent.getTime())).toBeLessThan(MINUTE);
    await prisma.$disconnect();
  });
});
