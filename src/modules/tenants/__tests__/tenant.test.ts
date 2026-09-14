import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  createTenant,
  updateTenant,
  suspendTenant,
  activateTenant,
  deactivateTenant,
  overrideSlug,
  setCustomSlug,
  listTenants,
  getPublishedTenantBySlug,
  listPublishedTenantSlugs,
  SlugTakenError,
  InvalidSlugError,
} from "@/modules/tenants/tenant";

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
    data: {
      id: crypto.randomUUID(),
      name: "Super Admin",
      email: `super-${crypto.randomUUID()}@example.test`,
      emailVerified: true,
      isSuperAdmin: true,
    },
  });
  cleanupUserIds.push(actor.id);
  return actor;
}

describe("Tenant CRUD (Chunk 3 Group 3.2)", () => {
  it("createTenant creates an Organization with ACTIVE status and the given business-profile fields", async () => {
    const actor = await makeActor();
    const org = await createTenant(
      { name: "Wedding Bells Catering", slug: `wb-${crypto.randomUUID().slice(0, 8)}`, ownerFirstName: "Asha", ownerLastName: "Rao" },
      actor.id,
    );
    cleanupOrgIds.push(org.id);

    expect(org.status).toBe("ACTIVE");
    expect(org.ownerFirstName).toBe("Asha");
    expect(org.ownerLastName).toBe("Rao");
  });

  it("createTenant rejects an invalid slug", async () => {
    const actor = await makeActor();
    await expect(createTenant({ name: "Bad Slug Co", slug: "has spaces!" }, actor.id)).rejects.toThrow(
      InvalidSlugError,
    );
  });

  it("createTenant rejects a slug already in use", async () => {
    const actor = await makeActor();
    const slug = `dup-${crypto.randomUUID().slice(0, 8)}`;
    const first = await createTenant({ name: "First Co", slug }, actor.id);
    cleanupOrgIds.push(first.id);

    await expect(createTenant({ name: "Second Co", slug }, actor.id)).rejects.toThrow(SlugTakenError);
  });

  it("updateTenant updates business-profile fields without touching status or slug", async () => {
    const actor = await makeActor();
    const org = await createTenant({ name: "Original Name", slug: `upd-${crypto.randomUUID().slice(0, 8)}` }, actor.id);
    cleanupOrgIds.push(org.id);

    const updated = await updateTenant(org.id, { name: "Renamed Co", city: "Bengaluru" }, actor.id);

    expect(updated.name).toBe("Renamed Co");
    expect(updated.city).toBe("Bengaluru");
    expect(updated.status).toBe("ACTIVE");
    expect(updated.slug).toBe(org.slug);
  });

  it("updateTenant round-trips the Chunk 4 onboarding business-profile fields", async () => {
    const actor = await makeActor();
    const org = await createTenant({ name: "Profile Co", slug: `prof-${crypto.randomUUID().slice(0, 8)}` }, actor.id);
    cleanupOrgIds.push(org.id);

    const updated = await updateTenant(
      org.id,
      {
        name: org.name,
        businessDescription: "The best catering in town.",
        websiteUrl: "https://example.test",
        instagramUrl: "https://instagram.test/example",
        facebookUrl: "https://facebook.test/example",
        gstShowOnInvoices: true,
        logo: "/uploads/organizations/x/logo.png",
      },
      actor.id,
    );

    expect(updated.businessDescription).toBe("The best catering in town.");
    expect(updated.websiteUrl).toBe("https://example.test");
    expect(updated.instagramUrl).toBe("https://instagram.test/example");
    expect(updated.facebookUrl).toBe("https://facebook.test/example");
    expect(updated.gstShowOnInvoices).toBe(true);
    expect(updated.logo).toBe("/uploads/organizations/x/logo.png");
  });

  it("suspendTenant sets status=SUSPENDED and writes an AuditLog row scoped to the tenant's own organizationId", async () => {
    const actor = await makeActor();
    const org = await createTenant({ name: "Suspend Co", slug: `sus-${crypto.randomUUID().slice(0, 8)}` }, actor.id);
    cleanupOrgIds.push(org.id);

    const suspended = await suspendTenant(org.id, actor.id);
    expect(suspended.status).toBe("SUSPENDED");

    const log = await prisma.auditLog.findFirst({ where: { organizationId: org.id, action: "tenant.suspend" } });
    expect(log).not.toBeNull();
    expect(log!.recordId).toBe(org.id);
  });

  it("activateTenant reverses a suspension back to ACTIVE and writes an AuditLog row", async () => {
    const actor = await makeActor();
    const org = await createTenant({ name: "Reactivate Co", slug: `react-${crypto.randomUUID().slice(0, 8)}` }, actor.id);
    cleanupOrgIds.push(org.id);
    await suspendTenant(org.id, actor.id);

    const activated = await activateTenant(org.id, actor.id);
    expect(activated.status).toBe("ACTIVE");

    const log = await prisma.auditLog.findFirst({ where: { organizationId: org.id, action: "tenant.activate" } });
    expect(log).not.toBeNull();
  });

  it("deactivateTenant soft-deactivates — the Organization row (and its AuditLog history) survives", async () => {
    const actor = await makeActor();
    const org = await createTenant({ name: "Deactivate Co", slug: `deact-${crypto.randomUUID().slice(0, 8)}` }, actor.id);
    cleanupOrgIds.push(org.id);

    const deactivated = await deactivateTenant(org.id, actor.id);
    expect(deactivated.status).toBe("DEACTIVATED");

    const stillExists = await prisma.organization.findUnique({ where: { id: org.id } });
    expect(stillExists).not.toBeNull();
  });

  it("overrideSlug changes the slug regardless of slugChangeCount and writes an AuditLog row with before/after slug values", async () => {
    const actor = await makeActor();
    const org = await createTenant({ name: "Slug Co", slug: `slugco-${crypto.randomUUID().slice(0, 8)}` }, actor.id);
    cleanupOrgIds.push(org.id);
    const newSlug = `newslug-${crypto.randomUUID().slice(0, 8)}`;

    const updated = await overrideSlug(org.id, newSlug, actor.id);
    expect(updated.slug).toBe(newSlug);
    expect(updated.slugChangeCount).toBe(1);

    const log = await prisma.auditLog.findFirst({ where: { organizationId: org.id, action: "tenant.slug_override" } });
    expect(log).not.toBeNull();
    expect(log!.before).toEqual({ slug: org.slug });
    expect(log!.after).toEqual({ slug: newSlug });
  });

  it("overrideSlug rejects a reserved path segment (e.g. \"super\")", async () => {
    const actor = await makeActor();
    const org = await createTenant({ name: "Reserved Test Co", slug: `rsv-${crypto.randomUUID().slice(0, 8)}` }, actor.id);
    cleanupOrgIds.push(org.id);

    await expect(overrideSlug(org.id, "super", actor.id)).rejects.toThrow(InvalidSlugError);
  });

  it("listTenants filters by status", async () => {
    const actor = await makeActor();
    const active = await createTenant({ name: "Active Co", slug: `active-${crypto.randomUUID().slice(0, 8)}` }, actor.id);
    const suspended = await createTenant({ name: "Suspended Co", slug: `susp-${crypto.randomUUID().slice(0, 8)}` }, actor.id);
    cleanupOrgIds.push(active.id, suspended.id);
    await suspendTenant(suspended.id, actor.id);

    const suspendedList = await listTenants({ status: "SUSPENDED" });
    expect(suspendedList.some((t) => t.id === suspended.id)).toBe(true);
    expect(suspendedList.some((t) => t.id === active.id)).toBe(false);
  });
});

describe("getPublishedTenantBySlug / listPublishedTenantSlugs (Chunk 8 Group 8.3)", () => {
  it("returns null for a tenant that has never claimed a custom slug (slugChangeCount === 0)", async () => {
    const actor = await makeActor();
    const org = await createTenant({ name: "Unclaimed Co", slug: `unclaimed-${crypto.randomUUID().slice(0, 8)}` }, actor.id);
    cleanupOrgIds.push(org.id);

    expect(await getPublishedTenantBySlug(org.slug)).toBeNull();
  });

  it("returns the tenant once slugChangeCount > 0, and is unreachable at the old slug afterward", async () => {
    const actor = await makeActor();
    const org = await createTenant({ name: "Claimed Co", slug: `pre-${crypto.randomUUID().slice(0, 6)}` }, actor.id);
    cleanupOrgIds.push(org.id);
    const newSlug = `live-${crypto.randomUUID().slice(0, 6)}`;

    await setCustomSlug(org.id, newSlug, actor.id);

    const found = await getPublishedTenantBySlug(newSlug);
    expect(found?.id).toBe(org.id);
    expect(await getPublishedTenantBySlug(org.slug)).toBeNull();
  });

  it("returns null for a SUSPENDED tenant even with a claimed slug", async () => {
    const actor = await makeActor();
    const org = await createTenant({ name: "Suspended Storefront Co", slug: `susp-pre-${crypto.randomUUID().slice(0, 4)}` }, actor.id);
    cleanupOrgIds.push(org.id);
    const newSlug = `susp-live-${crypto.randomUUID().slice(0, 4)}`;
    await setCustomSlug(org.id, newSlug, actor.id);
    await suspendTenant(org.id, actor.id);

    expect(await getPublishedTenantBySlug(newSlug)).toBeNull();
  });

  it("listPublishedTenantSlugs only includes claimed, ACTIVE tenants", async () => {
    const actor = await makeActor();
    const published = await createTenant({ name: "Published Co", slug: `pub-pre-${crypto.randomUUID().slice(0, 4)}` }, actor.id);
    const unclaimed = await createTenant({ name: "Unclaimed Co 2", slug: `unc-${crypto.randomUUID().slice(0, 8)}` }, actor.id);
    cleanupOrgIds.push(published.id, unclaimed.id);
    const publishedNewSlug = `pub-live-${crypto.randomUUID().slice(0, 4)}`;
    await setCustomSlug(published.id, publishedNewSlug, actor.id);

    const slugs = (await listPublishedTenantSlugs()).map((t) => t.slug);
    expect(slugs).toContain(publishedNewSlug);
    expect(slugs).not.toContain(unclaimed.slug);
  });
});
