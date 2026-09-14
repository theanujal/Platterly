import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";

export interface MenuInput {
  name: string;
  description?: string;
  image?: string;
  isActive?: boolean;
  /** Full replacement of this Menu's item list, in display order. */
  itemIds?: string[];
}

async function replaceMenuItems(menuId: string, itemIds: string[] | undefined) {
  if (itemIds === undefined) return;
  await prisma.menuMenuItem.deleteMany({ where: { menuId } });
  if (itemIds.length === 0) return;
  await prisma.menuMenuItem.createMany({
    data: itemIds.map((menuItemId, index) => ({ menuId, menuItemId, sortOrder: index })),
  });
}

export async function createMenu(organizationId: string, input: MenuInput, actorUserId: string) {
  const menu = await prisma.menu.create({
    data: {
      organizationId,
      name: input.name,
      description: input.description,
      image: input.image,
      isActive: input.isActive ?? true,
    },
  });
  await replaceMenuItems(menu.id, input.itemIds);

  await audit({
    organizationId,
    actorUserId,
    action: "menu.create",
    recordType: "Menu",
    recordId: menu.id,
    after: JSON.parse(JSON.stringify(menu)),
  });

  return menu;
}

export async function updateMenu(organizationId: string, id: string, input: MenuInput, actorUserId: string) {
  const before = await prisma.menu.findFirstOrThrow({ where: { id, organizationId } });

  const after = await prisma.menu.update({
    where: { id },
    data: {
      name: input.name,
      description: input.description,
      image: input.image,
      isActive: input.isActive ?? before.isActive,
    },
  });
  await replaceMenuItems(id, input.itemIds);

  await audit({
    organizationId,
    actorUserId,
    action: "menu.update",
    recordType: "Menu",
    recordId: id,
    before: JSON.parse(JSON.stringify(before)),
    after: JSON.parse(JSON.stringify(after)),
  });

  return after;
}

export async function deleteMenu(organizationId: string, id: string, actorUserId: string) {
  const before = await prisma.menu.findFirstOrThrow({ where: { id, organizationId } });
  await prisma.menu.delete({ where: { id } });

  await audit({
    organizationId,
    actorUserId,
    action: "menu.delete",
    recordType: "Menu",
    recordId: id,
    before: JSON.parse(JSON.stringify(before)),
  });
}

export async function listMenus(organizationId: string) {
  return prisma.menu.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } });
}

export async function getMenu(organizationId: string, id: string) {
  return prisma.menu.findFirst({
    where: { id, organizationId },
    include: { items: { include: { menuItem: true }, orderBy: { sortOrder: "asc" } } },
  });
}
