import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { newId } from "@platterly/contract";
import { signPlatformRequest } from "@platterly/platform-contract";
import { prisma } from "@/lib/db";
import type { PrismaClient } from "@/generated/prisma/client";
import { registerIntegration } from "../../integrations/registry";
import { receiveBusinessCreated } from "../../organisations/business-created";
import { erasePlatformRecords } from "../erase";

// The Platform's central records for an erased person, against the dev database inside ONE transaction that is rolled back (the audit table cannot have rows deleted).
const enabled = Boolean(process.env.DATABASE_URL && (process.env.PLATFORM_SECRETS_KEY || process.env.AUTH_SECRET));
class Rollback extends Error {}
type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
const BASE = "http://auth.localhost:3300";

describe.skipIf(!enabled)("erasing the Platform's records", () => {
  it("removes the business with its members, product links and roster, and the person's own rows, and the delete rules allow it", async () => {
    const err = await prisma.$transaction(async (tx: Tx) => {
      const productKey = `er${randomBytes(4).toString("hex")}`;
      const secrets = (await registerIntegration(tx, { kind: "system", ref: "test" }, { key: productKey, name: "Test product", baseUrl: "http://ertest.localhost:3500" }))!;
      const shim = new Proxy(tx, { get: (target, prop) => (prop === "$transaction" ? (fn: (t: Tx) => unknown) => fn(tx) : (target as never)[prop]) }) as unknown as PrismaClient;
      const make = async (subject: string) => {
        const businessId = newId("business");
        const body = { version: 1, messageId: newId("command"), type: "business.created", productKey, businessId, businessName: "Erase Kitchen", owner: { subject } };
        const raw = JSON.stringify(body);
        const url = `${BASE}/api/products/business-created`;
        await receiveBusinessCreated(
          { prisma: shim, readPerson: async () => ({ email: `er-${randomUUID()}@fixture.invalid`, emailVerified: true }), linkClient: tx as never },
          { rawBody: raw, method: "POST", url, headers: new Headers({ "content-type": "application/json", ...signPlatformRequest(secrets.inbound, body.messageId, raw, "POST", url) }) },
        );
        return businessId;
      };
      // The database allows one business per transaction, so only the erased one is created here.
      const gone = await make(`sub-${randomUUID()}`);
      const goneSubject = (await tx.$queryRaw<{ subject: string }[]>`select ui.subject from user_identities ui join organisation_members m on m.user_id = ui.user_id where m.organisation_id = ${gone}`)[0].subject;
      const count = async (q: Promise<{ n: bigint }[]>) => Number((await q)[0].n);
      await tx.$executeRaw`insert into organisation_team_members (organisation_id, legacy_member_id, name, email, role) values (${gone}, 'm1', 'Teammate', 'team@fixture.invalid', 'staff')`;

      expect(await count(tx.$queryRaw`select count(*) n from membership_product_slots where organisation_id = ${gone}`)).toBeGreaterThan(0);
      await erasePlatformRecords(tx, goneSubject, gone);

      expect(await count(tx.$queryRaw`select count(*) n from organisations where id = ${gone}`)).toBe(0);
      expect(await count(tx.$queryRaw`select count(*) n from organisation_members where organisation_id = ${gone}`)).toBe(0);
      expect(await count(tx.$queryRaw`select count(*) n from organisation_products where organisation_id = ${gone}`)).toBe(0);
      expect(await count(tx.$queryRaw`select count(*) n from organisation_team_members where organisation_id = ${gone}`)).toBe(0);
      expect(await count(tx.$queryRaw`select count(*) n from membership_product_slots where organisation_id = ${gone}`)).toBe(0);
      expect(await count(tx.$queryRaw`select count(*) n from audit_logs where organisation_id = ${gone} and action = 'organisation.erased'`)).toBe(1);
      expect(await count(tx.$queryRaw`select count(*) n from user_identities where subject = ${goneSubject}`)).toBe(0);
      throw new Rollback();
    }, { timeout: 60_000 }).catch((e: unknown) => e);
    if (!(err instanceof Rollback)) throw err;
  });
});
