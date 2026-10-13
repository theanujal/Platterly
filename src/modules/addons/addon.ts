import { RULES, validateInput } from "@/lib/validation";
import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import type { AddOnType, AddOnPriceType } from "@/generated/prisma/enums";

export interface AddOnInput {
  name: string;
  description?: string;
  image?: string;
  type: AddOnType;
  priceType: AddOnPriceType;
  price: number;
  includedInPackage?: boolean;
  /** true (the default) = every Menu offers it, including Menus added later; false = only `menuIds`. */
  appliesToAllMenus?: boolean;
  /** The Menus that offer it when `appliesToAllMenus` is false. Ignored otherwise. */
  menuIds?: string[];
  isActive?: boolean;
}

/** Full replacement of the add-on's Menus. Only this business's own Menus are kept; none are stored for an all-menus add-on. */
async function replaceAddOnMenus(organizationId: string, addOnId: string, input: AddOnInput) {
  if (input.appliesToAllMenus === undefined && input.menuIds === undefined) return;
  await prisma.addOnMenu.deleteMany({ where: { addOnId } });
  if (input.appliesToAllMenus !== false || !input.menuIds?.length) return;
  const menus = await prisma.menu.findMany({ where: { organizationId, id: { in: input.menuIds } }, select: { id: true } });
  await prisma.addOnMenu.createMany({ data: menus.map((m) => ({ addOnId, menuId: m.id })) });
}

function assertMenusChosen(input: AddOnInput) {
  if (input.appliesToAllMenus === false && !input.menuIds?.length) throw new Error("Choose at least one menu, or tick All menus.");
}

/** The shape listAddOns returns, as far as the Menu rule needs it. */
export interface AddOnMenuScope {
  appliesToAllMenus: boolean;
  menus: { menuId: string }[];
}

/** Whether a Menu offers this add-on. A Custom Menu has no Menu (`menuId` null), so it only gets all-menus add-ons. */
export function addOnOfferedOnMenu(addOn: AddOnMenuScope, menuId: string | null): boolean {
  return addOn.appliesToAllMenus || (menuId !== null && addOn.menus.some((m) => m.menuId === menuId));
}

export async function createAddOn(organizationId: string, input: AddOnInput, actorUserId: string) {
  validateInput(input, RULES.addOn);
  assertMenusChosen(input);
  const addOn = await prisma.addOn.create({
    data: {
      organizationId,
      name: input.name,
      description: input.description,
      image: input.image,
      type: input.type,
      priceType: input.priceType,
      price: input.price,
      includedInPackage: input.includedInPackage ?? false,
      appliesToAllMenus: input.appliesToAllMenus ?? true,
      isActive: input.isActive ?? true,
    },
  });
  await replaceAddOnMenus(organizationId, addOn.id, input);

  await audit({
    organizationId,
    actorUserId,
    action: "add_on.create",
    recordType: "AddOn",
    recordId: addOn.id,
    after: { ...JSON.parse(JSON.stringify(addOn)), menuIds: addOn.appliesToAllMenus ? [] : (input.menuIds ?? []) },
  });

  return addOn;
}

export async function updateAddOn(organizationId: string, id: string, input: AddOnInput, actorUserId: string) {
  validateInput(input, RULES.addOn);
  assertMenusChosen(input);
  const before = await prisma.addOn.findFirstOrThrow({ where: { id, organizationId }, include: { menus: { select: { menuId: true } } } });

  const after = await prisma.addOn.update({
    where: { id },
    data: {
      name: input.name,
      description: input.description,
      image: input.image,
      type: input.type,
      priceType: input.priceType,
      price: input.price,
      includedInPackage: input.includedInPackage ?? before.includedInPackage,
      appliesToAllMenus: input.appliesToAllMenus ?? before.appliesToAllMenus,
      isActive: input.isActive ?? before.isActive,
    },
  });
  await replaceAddOnMenus(organizationId, id, input);

  await audit({
    organizationId,
    actorUserId,
    action: "add_on.update",
    recordType: "AddOn",
    recordId: id,
    before: { ...JSON.parse(JSON.stringify(before)), menuIds: before.appliesToAllMenus ? [] : before.menus.map((m) => m.menuId) },
    after: { ...JSON.parse(JSON.stringify(after)), menuIds: after.appliesToAllMenus ? [] : (input.menuIds ?? before.menus.map((m) => m.menuId)) },
  });

  return after;
}

/** Hard delete — nothing references AddOn yet (standalone catalog, see schema comment). */
export async function deleteAddOn(organizationId: string, id: string, actorUserId: string) {
  const before = await prisma.addOn.findFirstOrThrow({ where: { id, organizationId } });
  await prisma.addOn.delete({ where: { id } });

  await audit({
    organizationId,
    actorUserId,
    action: "add_on.delete",
    recordType: "AddOn",
    recordId: id,
    before: JSON.parse(JSON.stringify(before)),
  });
}

export async function listAddOns(organizationId: string) {
  return prisma.addOn.findMany({ where: { organizationId }, orderBy: { name: "asc" }, include: { menus: { select: { menuId: true } } } });
}

export async function getAddOn(organizationId: string, id: string) {
  return prisma.addOn.findFirst({ where: { id, organizationId }, include: { menus: { select: { menuId: true } } } });
}

/** Copies an Add-on (AJ, 2026-09-30 — the card menu's Duplicate). */
export async function duplicateAddOn(organizationId: string, id: string, actorUserId: string) {
  const source = await getAddOn(organizationId, id);
  if (!source) throw new Error("Add-on not found.");
  return createAddOn(
    organizationId,
    {
      name: `${source.name} (Copy)`,
      description: source.description ?? undefined,
      image: source.image ?? undefined,
      type: source.type,
      priceType: source.priceType,
      price: Number(source.price),
      includedInPackage: source.includedInPackage,
      appliesToAllMenus: source.appliesToAllMenus,
      menuIds: source.menus.map((m) => m.menuId),
      isActive: source.isActive,
    },
    actorUserId,
  );
}

export async function setAddOnActive(organizationId: string, id: string, isActive: boolean, actorUserId: string) {
  const before = await prisma.addOn.findFirstOrThrow({ where: { id, organizationId } });
  const after = await prisma.addOn.update({ where: { id }, data: { isActive } });
  await audit({
    organizationId,
    actorUserId,
    action: "add_on.update",
    recordType: "AddOn",
    recordId: id,
    before: JSON.parse(JSON.stringify(before)),
    after: JSON.parse(JSON.stringify(after)),
  });
}
