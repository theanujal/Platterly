import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import type { PackagePricingModel } from "@/generated/prisma/enums";

export class InvalidPackagePricingError extends Error {}

export interface PackageItemInput {
  menuItemId: string;
  isOptional?: boolean;
  isAddOn?: boolean;
  extraPrice?: number;
}

export interface PackageInput {
  name: string;
  description?: string;
  image?: string;
  pricingModel: PackagePricingModel;
  fixedPrice?: number;
  perPersonPrice?: number;
  minGuests?: number;
  maxGuests?: number;
  isActive?: boolean;
  items: PackageItemInput[];
}

function validatePricing(input: PackageInput) {
  if (input.pricingModel === "FIXED" && input.fixedPrice == null) {
    throw new InvalidPackagePricingError("A FIXED package requires fixedPrice.");
  }
  if (input.pricingModel === "PER_PERSON" && input.perPersonPrice == null) {
    throw new InvalidPackagePricingError("A PER_PERSON package requires perPersonPrice.");
  }
  if (input.minGuests != null && input.maxGuests != null && input.minGuests > input.maxGuests) {
    throw new InvalidPackagePricingError("minGuests cannot exceed maxGuests.");
  }
}

async function replacePackageItems(packageId: string, items: PackageItemInput[]) {
  await prisma.menuPackageItem.deleteMany({ where: { packageId } });
  if (items.length === 0) return;
  await prisma.menuPackageItem.createMany({
    data: items.map((item) => ({
      packageId,
      menuItemId: item.menuItemId,
      isOptional: item.isOptional ?? false,
      isAddOn: item.isAddOn ?? false,
      extraPrice: item.extraPrice,
    })),
  });
}

export async function createPackage(organizationId: string, input: PackageInput, actorUserId: string) {
  validatePricing(input);

  const pkg = await prisma.menuPackage.create({
    data: {
      organizationId,
      name: input.name,
      description: input.description,
      image: input.image,
      pricingModel: input.pricingModel,
      fixedPrice: input.pricingModel === "FIXED" ? input.fixedPrice : undefined,
      perPersonPrice: input.pricingModel === "PER_PERSON" ? input.perPersonPrice : undefined,
      minGuests: input.minGuests,
      maxGuests: input.maxGuests,
      isActive: input.isActive ?? true,
    },
  });
  await replacePackageItems(pkg.id, input.items);

  await audit({
    organizationId,
    actorUserId,
    action: "menu_package.create",
    recordType: "MenuPackage",
    recordId: pkg.id,
    after: JSON.parse(JSON.stringify(pkg)),
  });

  return pkg;
}

export async function updatePackage(
  organizationId: string,
  id: string,
  input: PackageInput,
  actorUserId: string,
) {
  validatePricing(input);
  const before = await prisma.menuPackage.findFirstOrThrow({ where: { id, organizationId } });

  const after = await prisma.menuPackage.update({
    where: { id },
    data: {
      name: input.name,
      description: input.description,
      image: input.image,
      pricingModel: input.pricingModel,
      fixedPrice: input.pricingModel === "FIXED" ? input.fixedPrice : null,
      perPersonPrice: input.pricingModel === "PER_PERSON" ? input.perPersonPrice : null,
      minGuests: input.minGuests,
      maxGuests: input.maxGuests,
      isActive: input.isActive ?? before.isActive,
    },
  });
  await replacePackageItems(id, input.items);

  await audit({
    organizationId,
    actorUserId,
    action: "menu_package.update",
    recordType: "MenuPackage",
    recordId: id,
    before: JSON.parse(JSON.stringify(before)),
    after: JSON.parse(JSON.stringify(after)),
  });

  return after;
}

export async function deletePackage(organizationId: string, id: string, actorUserId: string) {
  const before = await prisma.menuPackage.findFirstOrThrow({ where: { id, organizationId } });
  await prisma.menuPackage.delete({ where: { id } });

  await audit({
    organizationId,
    actorUserId,
    action: "menu_package.delete",
    recordType: "MenuPackage",
    recordId: id,
    before: JSON.parse(JSON.stringify(before)),
  });
}

export async function listPackages(organizationId: string) {
  return prisma.menuPackage.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } });
}

export async function getPackage(organizationId: string, id: string) {
  return prisma.menuPackage.findFirst({
    where: { id, organizationId },
    include: { items: { include: { menuItem: true } } },
  });
}
