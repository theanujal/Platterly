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
  isActive?: boolean;
}

export async function createAddOn(organizationId: string, input: AddOnInput, actorUserId: string) {
  const addOn = await prisma.addOn.create({
    data: {
      organizationId,
      name: input.name,
      description: input.description,
      image: input.image,
      type: input.type,
      priceType: input.priceType,
      price: input.price,
      isActive: input.isActive ?? true,
    },
  });

  await audit({
    organizationId,
    actorUserId,
    action: "add_on.create",
    recordType: "AddOn",
    recordId: addOn.id,
    after: JSON.parse(JSON.stringify(addOn)),
  });

  return addOn;
}

export async function updateAddOn(organizationId: string, id: string, input: AddOnInput, actorUserId: string) {
  const before = await prisma.addOn.findFirstOrThrow({ where: { id, organizationId } });

  const after = await prisma.addOn.update({
    where: { id },
    data: {
      name: input.name,
      description: input.description,
      image: input.image,
      type: input.type,
      priceType: input.priceType,
      price: input.price,
      isActive: input.isActive ?? before.isActive,
    },
  });

  await audit({
    organizationId,
    actorUserId,
    action: "add_on.update",
    recordType: "AddOn",
    recordId: id,
    before: JSON.parse(JSON.stringify(before)),
    after: JSON.parse(JSON.stringify(after)),
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
  return prisma.addOn.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
}

export async function getAddOn(organizationId: string, id: string) {
  return prisma.addOn.findFirst({ where: { id, organizationId } });
}
