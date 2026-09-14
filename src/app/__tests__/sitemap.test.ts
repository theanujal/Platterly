import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createTenant, setCustomSlug } from "@/modules/tenants/tenant";
import sitemap from "@/app/sitemap";

const cleanupOrgIds: string[] = [];
const cleanupUserIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: cleanupOrgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
  cleanupOrgIds.length = 0;
  cleanupUserIds.length = 0;
});

async function makeActor() {
  const actor = await prisma.user.create({
    data: { id: crypto.randomUUID(), name: "Owner", email: `owner-${crypto.randomUUID()}@example.test`, emailVerified: true },
  });
  cleanupUserIds.push(actor.id);
  return actor;
}

describe("sitemap.xml (Chunk 8 Group 8.3 — Verify: includes only published storefronts)", () => {
  it("includes a claimed tenant's storefront URL but not an unclaimed tenant's", async () => {
    const actor = await makeActor();
    const published = await createTenant({ name: "Sitemap Published Co", slug: `sm-pre-${crypto.randomUUID().slice(0, 4)}` }, actor.id);
    const unclaimed = await createTenant({ name: "Sitemap Unclaimed Co", slug: `sm-unc-${crypto.randomUUID().slice(0, 8)}` }, actor.id);
    cleanupOrgIds.push(published.id, unclaimed.id);
    const claimedSlug = `sm-live-${crypto.randomUUID().slice(0, 4)}`;
    await setCustomSlug(published.id, claimedSlug, actor.id);

    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    expect(urls.some((u) => u.endsWith(`/${claimedSlug}`))).toBe(true);
    expect(urls.some((u) => u.endsWith(`/${unclaimed.slug}`))).toBe(false);
  });
});
