import { describe, it, expect, afterEach, vi } from "vitest";

// The real Server Actions with the real sign-in, role and permission checks (require-session.ts, role-grants.ts). Only the session
// itself is faked: who is signed in, and which kitchen is active. Nothing about permissions is stubbed.
const who = vi.hoisted(() => ({ userId: "", activeOrganizationId: "" }));
vi.mock("@/lib/auth/auth", () => ({
  auth: {
    api: {
      getSession: async () => ({ user: { id: who.userId, email: "x@example.test" }, session: { activeOrganizationId: who.activeOrganizationId } }),
      setActiveOrganization: async () => undefined,
    },
  },
}));
vi.mock("@/modules/ops-link/entitlements", () => ({ isLocked: async () => false }));
// forbidden() only works inside the Next runtime; here it throws the same 403 marker so a refusal can be told from any other failure.
vi.mock("next/navigation", () => ({
  forbidden: () => {
    throw Object.assign(new Error("FORBIDDEN"), { digest: "NEXT_HTTP_ERROR_FALLBACK;403" });
  },
  redirect: (to: string) => {
    throw Object.assign(new Error(`REDIRECT ${to}`), { digest: `NEXT_REDIRECT;${to}` });
  },
  notFound: () => {
    throw Object.assign(new Error("NOT_FOUND"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));

import { prisma } from "@/lib/db";
import { createMenuItem } from "@/modules/menus/item";
import { createInventoryItem } from "@/modules/inventory/inventory";
import { getRecipeForItem, saveRecipe } from "@/modules/recipes/recipe";
import { defaultGrants, saveRoleGrants } from "@/modules/roles/role-grants";
import { saveRecipeAction, setRecipeStatusAction } from "@/app/(app)/menu-catalog/items/actions";

const orgIds: string[] = [];
const userIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.rolePermissionOverride.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.recipe.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.menuItem.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.inventory.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  orgIds.length = 0;
  userIds.length = 0;
});

async function newKitchen(name: string) {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name, slug: `rp-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() } });
  orgIds.push(org.id);
  const person = async (role: string) => {
    const user = await prisma.user.create({ data: { id: crypto.randomUUID(), name: role, email: `${role}-${crypto.randomUUID()}@example.test`, emailVerified: true } });
    userIds.push(user.id);
    await prisma.member.create({ data: { id: crypto.randomUUID(), organizationId: org.id, userId: user.id, role, createdAt: new Date() } });
    return user;
  };
  const owner = await person("owner");
  const paneer = await createInventoryItem(org.id, { name: "Paneer", category: "Dairy", unit: "kg" }, owner.id);
  const dish = await createMenuItem(org.id, { name: "Paneer Masala", foodType: "VEGETARIAN", price: 100 }, owner.id);
  await saveRecipe(org.id, dish.id, { yieldServings: 10, ingredients: [{ inventoryId: paneer.id, quantity: 2 }] }, owner.id);
  return { org, owner, person, dish, paneer };
}

const signedInAs = (user: { id: string }, organizationId: string) => {
  who.userId = user.id;
  who.activeOrganizationId = organizationId;
};
const status = async (orgId: string, dishId: string) => (await getRecipeForItem(orgId, dishId))!.status;
const auditCount = (orgId: string) => prisma.auditLog.count({ where: { organizationId: orgId, action: { in: ["recipe.activate", "recipe.return_to_draft"] } } });
const isForbidden = (error: unknown) => String((error as { digest?: string }).digest ?? error).includes("403");

describe("changing a recipe's status needs menus: edit", () => {
  it.each(["staff", "inventoryTeam", "accounts", "salesEvents"])("a %s (no menu edit) cannot activate or return a recipe to Draft, and nothing changes", async (role) => {
    const k = await newKitchen("Perm Org");
    const user = await k.person(role);
    expect(defaultGrants(role).menus).not.toContain("edit");

    signedInAs(user, k.org.id);
    const activate = await setRecipeStatusAction(k.dish.id, "ACTIVE").catch((e) => e);
    expect(isForbidden(activate), `${role} activate: ${String(activate)}`).toBe(true);
    expect(await status(k.org.id, k.dish.id)).toBe("DRAFT");

    // an owner activates it; the person without the grant still cannot send it back
    signedInAs(k.owner, k.org.id);
    expect(await setRecipeStatusAction(k.dish.id, "ACTIVE")).toEqual({ ok: true });
    signedInAs(user, k.org.id);
    const back = await setRecipeStatusAction(k.dish.id, "DRAFT").catch((e) => e);
    expect(isForbidden(back), `${role} return to draft: ${String(back)}`).toBe(true);
    expect(await status(k.org.id, k.dish.id)).toBe("ACTIVE");
    expect(await auditCount(k.org.id)).toBe(1); // only the owner's activation
  });

  it.each(["owner", "manager", "kitchen"])("a %s (menu edit) can activate and return it to Draft", async (role) => {
    const k = await newKitchen("Perm Org");
    const user = role === "owner" ? k.owner : await k.person(role);
    signedInAs(user, k.org.id);
    expect(await setRecipeStatusAction(k.dish.id, "ACTIVE")).toEqual({ ok: true });
    expect(await status(k.org.id, k.dish.id)).toBe("ACTIVE");
    expect(await setRecipeStatusAction(k.dish.id, "DRAFT")).toEqual({ ok: true });
    expect(await status(k.org.id, k.dish.id)).toBe("DRAFT");
  });

  it("the business's own role settings apply: once the owner takes menu editing away from managers, a manager is refused", async () => {
    const k = await newKitchen("Perm Org");
    const manager = await k.person("manager");
    signedInAs(manager, k.org.id);
    expect(await setRecipeStatusAction(k.dish.id, "ACTIVE")).toEqual({ ok: true });
    await saveRoleGrants(k.org.id, "manager", { ...defaultGrants("manager"), menus: ["view"] }, k.owner.id);
    const refused = await setRecipeStatusAction(k.dish.id, "DRAFT").catch((e) => e);
    expect(isForbidden(refused)).toBe(true);
    expect(await status(k.org.id, k.dish.id)).toBe("ACTIVE");
  });

  it("the same guard protects saving a recipe, which is what can send an Active recipe back to Draft", async () => {
    const k = await newKitchen("Perm Org");
    const user = await k.person("accounts");
    signedInAs(k.owner, k.org.id);
    await setRecipeStatusAction(k.dish.id, "ACTIVE");
    signedInAs(user, k.org.id);
    const refused = await saveRecipeAction(k.dish.id, { yieldServings: 20, ingredients: [{ inventoryId: k.paneer.id, quantity: 9 }] }).catch((e) => e);
    expect(isForbidden(refused)).toBe(true);
    const recipe = await getRecipeForItem(k.org.id, k.dish.id);
    expect([recipe?.status, Number(recipe?.yieldServings)]).toEqual(["ACTIVE", 10]);
  });
});

describe("another business is still shut out", () => {
  it("someone who is not a member of the kitchen is refused, even with its id as their active kitchen", async () => {
    const a = await newKitchen("Kitchen A");
    const b = await newKitchen("Kitchen B");
    signedInAs(b.owner, a.org.id); // a member of B only, claiming A
    const refused = await setRecipeStatusAction(a.dish.id, "ACTIVE").catch((e) => e);
    expect(isForbidden(refused)).toBe(true);
    expect(await status(a.org.id, a.dish.id)).toBe("DRAFT");
  });

  it("a full-rights owner of another business cannot reach this business's recipe by its dish id", async () => {
    const a = await newKitchen("Kitchen A");
    const b = await newKitchen("Kitchen B");
    signedInAs(b.owner, b.org.id);
    const result = await setRecipeStatusAction(a.dish.id, "ACTIVE");
    expect(result).toMatchObject({ ok: false });
    expect(await status(a.org.id, a.dish.id)).toBe("DRAFT");
    expect(await status(b.org.id, b.dish.id)).toBe("DRAFT"); // and their own recipe is untouched too
    expect(await auditCount(a.org.id)).toBe(0);
    expect(await auditCount(b.org.id)).toBe(0);
  });
});
