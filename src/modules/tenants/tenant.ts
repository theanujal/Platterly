import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import type { TenantStatus } from "@/generated/prisma/enums";
import { validateSlugFormat } from "./slug";

export interface TenantProfileInput {
  name: string;
  slug: string;
  ownerName?: string;
  contactPhone?: string;
  contactEmail?: string;
  gstNumber?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export type TenantProfileUpdateInput = Omit<TenantProfileInput, "slug">;

export class SlugTakenError extends Error {}
export class InvalidSlugError extends Error {}

/**
 * Chunk 3 Group 3.2 (PRD §8.2). Creates only the Organization/business-profile
 * record — no User/Member row. Real owner login provisioning is Chunk 4's
 * self-serve onboarding job, not Super Admin's.
 */
export async function createTenant(input: TenantProfileInput, actorUserId: string) {
  const validation = validateSlugFormat(input.slug);
  if (!validation.valid) {
    throw new InvalidSlugError(validation.error);
  }

  const existing = await prisma.organization.findUnique({ where: { slug: input.slug } });
  if (existing) {
    throw new SlugTakenError(`Slug "${input.slug}" is already in use.`);
  }

  const org = await prisma.organization.create({
    data: {
      id: crypto.randomUUID(),
      createdAt: new Date(),
      name: input.name,
      slug: input.slug,
      ownerName: input.ownerName,
      contactPhone: input.contactPhone,
      contactEmail: input.contactEmail,
      gstNumber: input.gstNumber,
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2,
      city: input.city,
      state: input.state,
      postalCode: input.postalCode,
      country: input.country,
    },
  });

  await audit({
    organizationId: org.id,
    actorUserId,
    action: "tenant.create",
    recordType: "Organization",
    recordId: org.id,
    after: JSON.parse(JSON.stringify(org)),
  });

  return org;
}

/** Business-profile fields only — status and slug have their own dedicated actions. */
export async function updateTenant(id: string, input: TenantProfileUpdateInput, actorUserId: string) {
  const before = await prisma.organization.findUniqueOrThrow({ where: { id } });

  const after = await prisma.organization.update({
    where: { id },
    data: {
      name: input.name,
      ownerName: input.ownerName,
      contactPhone: input.contactPhone,
      contactEmail: input.contactEmail,
      gstNumber: input.gstNumber,
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2,
      city: input.city,
      state: input.state,
      postalCode: input.postalCode,
      country: input.country,
    },
  });

  await audit({
    organizationId: id,
    actorUserId,
    action: "tenant.update",
    recordType: "Organization",
    recordId: id,
    before: JSON.parse(JSON.stringify(before)),
    after: JSON.parse(JSON.stringify(after)),
  });

  return after;
}

async function setStatus(id: string, status: TenantStatus, action: string, actorUserId: string) {
  const before = await prisma.organization.findUniqueOrThrow({ where: { id } });

  const after = await prisma.organization.update({ where: { id }, data: { status } });

  await audit({
    organizationId: id,
    actorUserId,
    action,
    recordType: "Organization",
    recordId: id,
    before: { status: before.status },
    after: { status: after.status },
  });

  return after;
}

export const suspendTenant = (id: string, actorUserId: string) =>
  setStatus(id, "SUSPENDED", "tenant.suspend", actorUserId);

export const activateTenant = (id: string, actorUserId: string) =>
  setStatus(id, "ACTIVE", "tenant.activate", actorUserId);

/** Soft-deactivate only — no hard delete; the Organization row and its AuditLog history survive. */
export const deactivateTenant = (id: string, actorUserId: string) =>
  setStatus(id, "DEACTIVATED", "tenant.deactivate", actorUserId);

/**
 * Super Admin escalation path for Chunk 8's self-service 2-change slug
 * limit — this override is unconditional regardless of `slugChangeCount`
 * (the self-service UI is the thing that will enforce the limit; this is
 * the "only a Super Admin can force a further change" bypass).
 */
export async function overrideSlug(id: string, newSlug: string, actorUserId: string) {
  const validation = validateSlugFormat(newSlug);
  if (!validation.valid) {
    throw new InvalidSlugError(validation.error);
  }

  const before = await prisma.organization.findUniqueOrThrow({ where: { id } });

  if (before.slug === newSlug) {
    return before;
  }

  const existing = await prisma.organization.findUnique({ where: { slug: newSlug } });
  if (existing) {
    throw new SlugTakenError(`Slug "${newSlug}" is already in use.`);
  }

  const after = await prisma.organization.update({
    where: { id },
    data: { slug: newSlug, slugChangeCount: { increment: 1 } },
  });

  await audit({
    organizationId: id,
    actorUserId,
    action: "tenant.slug_override",
    recordType: "Organization",
    recordId: id,
    before: { slug: before.slug },
    after: { slug: after.slug },
  });

  return after;
}

export async function listTenants(filter?: { status?: TenantStatus }) {
  return prisma.organization.findMany({
    where: filter?.status ? { status: filter.status } : undefined,
    orderBy: { createdAt: "desc" },
  });
}

export async function getTenant(id: string) {
  return prisma.organization.findUnique({
    where: { id },
    include: {
      subscriptions: {
        where: { endDate: null },
        include: { subscriptionPlan: true },
        take: 1,
      },
    },
  });
}
