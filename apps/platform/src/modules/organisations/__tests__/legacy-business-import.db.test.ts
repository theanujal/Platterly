import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { newId } from "@platterly/contract";
import { prisma } from "@/lib/db";
import type { PrismaClient } from "@/generated/prisma/client";
import { createTestUser, emailOfUser } from "../../users/__tests__/fixtures";
import { importCaterlyBusinesses } from "../legacy-business-import";

// #119: two waiting businesses whose owners have both signed in are created in one run. Everything runs in ONE outer transaction that is rolled back
// (the audit table cannot have rows deleted); each business gets its own transaction object, as the runner's one $transaction per business does.
const enabled = Boolean(process.env.DATABASE_URL);
class Rollback extends Error {}
type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

describe.skipIf(!enabled)("Caterly business import", () => {
  it("creates two businesses in one run when both owners have signed in", async () => {
    const err = await prisma
      .$transaction(async (tx) => {
        const kitchens = await Promise.all(
          ["Kitchen A", "Kitchen B"].map(async (name) => {
            const userId = await createTestUser(tx);
            return { name, userId, email: await emailOfUser(tx, userId), orgId: `org-${randomUUID()}`, businessId: newId("business"), caterlyUserId: `cu-${randomUUID()}` };
          }),
        );
        const input = {
          organisations: kitchens.map((k) => ({ id: k.orgId, name: k.name, businessId: k.businessId })),
          members: kitchens.map((k) => ({ id: `m-${randomUUID()}`, organizationId: k.orgId, userId: k.caterlyUserId, role: "owner", createdAt: new Date(), disabledAt: null })),
          users: kitchens.map((k) => ({ id: k.caterlyUserId, name: k.name, email: k.email })),
          batchId: "test-119",
        };
        const report = await importCaterlyBusinesses((work) => work(new Proxy(tx, {}) as Tx), input);
        expect(report).toMatchObject({ created: 2, refused: [], waitingForFirstSignIn: [] });
        expect(await tx.organisation.count({ where: { id: { in: kitchens.map((k) => k.businessId) } } })).toBe(2);
        throw new Rollback();
      }, { timeout: 30_000 })
      .catch((e: unknown) => e);
    if (!(err instanceof Rollback)) throw err;
  });
});
