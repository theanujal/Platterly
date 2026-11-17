import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { describe, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { importCaterlyBusinesses, type PerBusinessTransaction } from "../legacy-business-import";

// Runner for the Caterly business import (there is no script runner for TypeScript here). Skipped unless CATERLY_BUSINESS_IMPORT is "dry" or "apply".
//   CATERLY_BUSINESS_IMPORT=dry   CATERLY_COPY_DATABASE_URL=... DATABASE_URL=... npx vitest run legacy-business-import.run
// A dry run does all the work in a transaction and rolls it back. The source must be a COPY database on the F4 cluster; the target must be the F4 Platform database.
// On the live server (one Postgres, port 5432) add CATERLY_BUSINESS_IMPORT_PRODUCTION=1: the target must then be platterly_platform and the source a copy, on any port.
const mode = process.env.CATERLY_BUSINESS_IMPORT;
const production = process.env.CATERLY_BUSINESS_IMPORT_PRODUCTION === "1";
class Rollback extends Error {}
const part = (url: string) => ({ db: new URL(url).pathname.replace(/^\//, ""), port: new URL(url).port || "5432" });

describe.skipIf(mode !== "dry" && mode !== "apply")("Caterly business import (runner)", () => {
  it("imports", async () => {
    const sourceUrl = process.env.CATERLY_COPY_DATABASE_URL ?? "";
    const targetUrl = process.env.DATABASE_URL ?? "";
    const s = part(sourceUrl);
    const t = part(targetUrl);
    if (!/copy/i.test(s.db)) throw new Error("the source must be a COPY database (name contains 'copy')");
    if (production) {
      if (t.db !== "platterly_platform") throw new Error("with CATERLY_BUSINESS_IMPORT_PRODUCTION=1 the target must be platterly_platform");
    } else {
      if (s.port === "5432" || s.port === "55432") throw new Error("the source must not be on 5432 or 55432 (a live server needs CATERLY_BUSINESS_IMPORT_PRODUCTION=1)");
      if (t.port !== "55434" || !["platterly_platform", "platterly_rehearsal_platform"].includes(t.db)) throw new Error("the target must be platterly_platform (or the scratch platterly_rehearsal_platform) on the F4 cluster (55434); a live server needs CATERLY_BUSINESS_IMPORT_PRODUCTION=1");
    }

    const source = new Pool({ connectionString: sourceUrl, max: 1 });
    const pool = new Pool({ connectionString: targetUrl, max: 1 });
    const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    try {
      const organisations = (await source.query(`select id, name, "businessId" from organization order by id`)).rows;
      const members = (await source.query(`select id, "organizationId", "userId", role, "createdAt", "disabledAt" from member`)).rows;
      const users = (await source.query(`select id, name, email from "user"`)).rows;
      const batchId = `caterly-biz-${new Date().toISOString().slice(0, 10)}`;
      // One transaction per business (a transaction may change only one organisation). Apply commits each one; a dry run rolls each one back.
      const perBusiness: PerBusinessTransaction = async (work) => {
        if (mode === "apply") return prisma.$transaction(work, { timeout: 60_000 });
        let result: Awaited<ReturnType<typeof work>> | undefined;
        await prisma.$transaction(async (tx) => { result = await work(tx); throw new Rollback(); }, { timeout: 60_000 }).catch((e: unknown) => { if (!(e instanceof Rollback)) throw e; });
        return result as Awaited<ReturnType<typeof work>>;
      };
      const report = await importCaterlyBusinesses(perBusiness, { organisations, members, users, batchId });
      console.log(mode === "apply" ? "APPLIED" : "DRY RUN (nothing written)", JSON.stringify(report, null, 2));
    } finally {
      await prisma.$disconnect();
      await source.end();
    }
  }, 120_000);
});
