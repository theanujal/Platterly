import { describe, expect, it } from "vitest";

// The Prisma adapter treats dates as UTC, so this app's connections must run in UTC. App columns here are timestamp WITHOUT time zone, which Prisma writes and reads
// correctly whatever the session time zone is; but a date the DATABASE fills in itself (now() in raw SQL, a column default, a comparison with now()) uses the
// session's clock, so on a database set to another zone (a local cluster set to Asia/Kolkata) it came out 5 hours 30 minutes away from what Prisma wrote.
// Read-only: it only selects.
const MINUTE = 60_000;

describe.skipIf(!process.env.DATABASE_URL)("the database connection agrees with the database clock", () => {
  it("reads the database's own clock as the real current time and round-trips a date", async () => {
    const { prisma } = await import("@/lib/db");
    const sent = new Date();
    const rows = await prisma.$queryRaw<{ wall: Date; back: Date }[]>`select localtimestamp as wall, ${sent}::timestamp as back`;
    expect(Math.abs(rows[0].wall.getTime() - Date.now())).toBeLessThan(MINUTE);
    expect(rows[0].back.getTime()).toBe(sent.getTime());
    await prisma.$disconnect();
  });
});
