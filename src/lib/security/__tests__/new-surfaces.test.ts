import { describe, it, expect, afterAll } from "vitest";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { RESERVED_PATH_SEGMENTS, isReservedPathSegment } from "@/lib/routing/reserved-words";
import { getPublishedTenantBySlug, listPublishedTenantSlugs } from "@/modules/tenants/tenant";
import { provisionTenantForNewUser } from "@/modules/tenants/auto-provision";
import { INVITATION_EXPIRES_IN_SECONDS, INVITATION_EXPIRY_HOURS } from "@/modules/team/invitation-config";
import { applyTeamPrivacy } from "@/modules/team/team";
import { createCustomer, listCustomers } from "@/modules/customers/customer";
import { listMenus } from "@/modules/menus/menu";
import { issueToken, resolveToken } from "@/lib/secure-access/token";

/**
 * Chunk 17.4 — regression sweep for the surfaces added after the first chunks: self-serve sign-up, the public storefront,
 * team invitations and privacy, and the secure links.
 */
const orgIds: string[] = [];
const userIds: string[] = [];

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.secureAccessToken.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.subscription.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}, 60_000);

async function makeUser(label: string) {
  const user = await prisma.user.create({ data: { id: crypto.randomUUID(), name: label, email: `ns-${label}-${crypto.randomUUID()}@example.test`, emailVerified: true, firstName: label, lastName: "Tester" } });
  userIds.push(user.id);
  return user;
}

describe("self-serve sign-up creates an isolated kitchen", () => {
  it("two sign-ups get separate kitchens, each with only its own owner, and see none of each other's data", async () => {
    const [u1, u2] = [await makeUser("one"), await makeUser("two")];
    const [p1, p2] = [await provisionTenantForNewUser(u1.id), await provisionTenantForNewUser(u2.id)];
    expect(p1.organizationId).toBeTruthy();
    expect(p2.organizationId).toBeTruthy();
    expect(p1.organizationId).not.toBe(p2.organizationId);
    orgIds.push(p1.organizationId!, p2.organizationId!);

    const members1 = await prisma.member.findMany({ where: { organizationId: p1.organizationId! } });
    expect(members1.map((m) => [m.userId, m.role])).toEqual([[u1.id, "owner"]]);
    expect(await prisma.member.count({ where: { userId: u2.id, organizationId: p1.organizationId! } })).toBe(0);

    await createCustomer(p1.organizationId!, { name: "Only in kitchen one", phone: "9876543299" }, u1.id);
    expect(await listCustomers(p2.organizationId!)).toHaveLength(0);
    expect(await listMenus(p2.organizationId!)).toHaveLength(0);

    const [o1, o2] = await Promise.all([prisma.organization.findUniqueOrThrow({ where: { id: p1.organizationId! } }), prisma.organization.findUniqueOrThrow({ where: { id: p2.organizationId! } })]);
    expect(o1.slug).not.toBe(o2.slug);
  });
});

describe("the public storefront", () => {
  it("every top-level route of the app is a reserved word, so no kitchen can claim it as a storefront address", () => {
    const routeFolders = new Set<string>();
    for (const root of ["src/app", "src/app/(app)"]) {
      for (const name of readdirSync(path.join(process.cwd(), root))) {
        if (!statSync(path.join(process.cwd(), root, name)).isDirectory()) continue;
        if (name.startsWith("_") || name.startsWith("(") || name.startsWith("[") || name === "__tests__") continue;
        routeFolders.add(name);
      }
    }
    const unreserved = [...routeFolders].filter((name) => !isReservedPathSegment(name));
    expect(unreserved, `add these to RESERVED_PATH_SEGMENTS: ${unreserved.join(", ")}`).toEqual([]);
    expect(RESERVED_PATH_SEGMENTS.length).toBeGreaterThan(20);
  });

  it("only an active kitchen that claimed its own link is published; guessing a slug finds nothing else", async () => {
    const make = async (slug: string, patch: Record<string, unknown>) => {
      const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: slug, slug, createdAt: new Date(), ...patch } });
      orgIds.push(org.id);
      return org;
    };
    const tag = crypto.randomUUID().slice(0, 6);
    const live = await make(`live-${tag}`, { status: "ACTIVE", slugChangeCount: 1 });
    await make(`placeholder-${tag}`, { status: "ACTIVE", slugChangeCount: 0 });
    await make(`suspended-${tag}`, { status: "SUSPENDED", slugChangeCount: 1 });
    await make(`deactivated-${tag}`, { status: "DEACTIVATED", slugChangeCount: 2 });

    expect((await getPublishedTenantBySlug(`live-${tag}`))?.id).toBe(live.id);
    for (const slug of [`placeholder-${tag}`, `suspended-${tag}`, `deactivated-${tag}`, "does-not-exist", "LIVE-" + tag, `live-${tag} `, "../etc/passwd", "' OR 1=1 --"]) {
      expect(await getPublishedTenantBySlug(slug), slug).toBeNull();
    }
    const listed = (await listPublishedTenantSlugs()).map((t) => t.slug);
    expect(listed).toContain(`live-${tag}`);
    for (const hidden of [`placeholder-${tag}`, `suspended-${tag}`, `deactivated-${tag}`]) expect(listed).not.toContain(hidden);
  });

  it("a reserved word cannot be a slug", () => {
    for (const word of ["super", "api", "kitchenlogin", "settings", "dashboard", "unsubscribe", "pay", "quote"]) expect(isReservedPathSegment(word)).toBe(true);
    expect(isReservedPathSegment("bhandarys-kitchen")).toBe(false);
  });
});

describe("team invitations and privacy", () => {
  it("invitation links last 48 hours, from one constant", () => {
    expect(INVITATION_EXPIRY_HOURS).toBe(48);
    expect(INVITATION_EXPIRES_IN_SECONDS).toBe(48 * 60 * 60);
  });

  const team = [
    { userId: "o", role: "owner", user: { name: "Owner", email: "o@x.test", image: "o.png" } },
    { userId: "m", role: "manager", user: { name: "Manager", email: "m@x.test", image: "m.png" } },
    { userId: "s", role: "staff", user: { name: "Staff", email: "s@x.test", image: "s.png" } },
  ];
  const hidden = { allowTeamVisibility: false, showName: false, showEmail: false, showAvatar: false };

  it("the owner always sees everyone in full, whatever the privacy switches say", () => {
    expect(applyTeamPrivacy(team, { userId: "o", role: "owner" }, hidden)).toEqual(team);
  });

  it("others only see themselves and the owner when visibility is off, and blanked details when a flag is off", () => {
    expect(applyTeamPrivacy(team, { userId: "s", role: "staff" }, hidden).map((m) => m.userId).sort()).toEqual(["o", "s"]);
    const some = applyTeamPrivacy(team, { userId: "s", role: "staff" }, { allowTeamVisibility: true, showName: false, showEmail: false, showAvatar: false });
    const manager = some.find((m) => m.userId === "m")!;
    expect(manager.user).toEqual({ name: "Team member", email: "", image: null });
    expect(some.find((m) => m.userId === "s")!.user.email).toBe("s@x.test"); // you always see yourself
    expect(some.find((m) => m.userId === "o")!.user.email).toBe("o@x.test"); // the owner is never hidden
  });
});

describe("secure links", () => {
  it("a link belongs to the kitchen that issued it, and a revoked or expired one resolves to nothing", async () => {
    const owner = await makeUser("tok");
    const p = await provisionTenantForNewUser(owner.id);
    orgIds.push(p.organizationId!);
    const token = await issueToken({ organizationId: p.organizationId!, resourceType: "QUOTATION", resourceId: "q1", expiresInDays: 1 });
    expect((await resolveToken(token.token))?.organizationId).toBe(p.organizationId);
    expect(await resolveToken(token.token + "x")).toBeNull();
    expect(await resolveToken("")).toBeNull();
    await prisma.secureAccessToken.update({ where: { id: token.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await resolveToken(token.token)).toBeNull();
  });
});
