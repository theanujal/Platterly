import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";

const cleanupOrgIds: string[] = [];

afterEach(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: cleanupOrgIds } } });
  cleanupOrgIds.length = 0;
});

describe("audit() (Chunk 2 Group 2.2)", () => {
  it("preserves before/after JSON exactly", async () => {
    const org = await prisma.organization.create({
      data: { id: crypto.randomUUID(), name: "Audit Test Org", slug: `audit-${crypto.randomUUID()}`, createdAt: new Date() },
    });
    cleanupOrgIds.push(org.id);

    const before = { status: "Draft" };
    const after = { status: "Sent to Customer" };

    const row = await audit({
      organizationId: org.id,
      action: "menu_approval.transition",
      recordType: "MenuApproval",
      recordId: "ma_1",
      before,
      after,
    });

    expect(row.before).toEqual(before);
    expect(row.after).toEqual(after);
    expect(row.actorUserId).toBeNull();
  });
});
