import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import type { TenantStatus } from "@/generated/prisma/enums";
import { validateSlugFormat } from "./slug";

export interface TenantProfileInput {
  name: string;
  slug: string;
  ownerFirstName?: string;
  ownerLastName?: string;
  contactPhone?: string;
  contactEmail?: string;
  gstNumber?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  // Chunk 4 Group 4.2 — self-serve onboarding's business-profile fields,
  // extending the same Organization row rather than a separate table.
  logo?: string;
  businessDescription?: string;
  websiteUrl?: string;
  instagramUrl?: string;
  facebookUrl?: string;
  gstShowOnInvoices?: boolean;
  // Order Numbering — Kitchen Admin-configurable prefix/counter/padding for
  // human-readable Order Numbers (e.g. "AJ-0001"), consumed by
  // src/modules/orders/order.ts's nextOrderNumber. Editing orderNumberNextValue
  // after orders already exist deliberately lets the admin jump/reset the
  // counter — their explicit choice, not guarded here.
  orderNumberPrefix?: string;
  orderNumberNextValue?: number;
  orderNumberPadding?: number;
}

export type TenantProfileUpdateInput = Omit<TenantProfileInput, "slug">;

export class SlugTakenError extends Error {}
export class InvalidSlugError extends Error {}
export class SlugChangeLimitError extends Error {}

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
      ownerFirstName: input.ownerFirstName,
      ownerLastName: input.ownerLastName,
      contactPhone: input.contactPhone,
      contactEmail: input.contactEmail,
      gstNumber: input.gstNumber,
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2,
      city: input.city,
      state: input.state,
      postalCode: input.postalCode,
      country: input.country,
      logo: input.logo,
      businessDescription: input.businessDescription,
      websiteUrl: input.websiteUrl,
      instagramUrl: input.instagramUrl,
      facebookUrl: input.facebookUrl,
      gstShowOnInvoices: input.gstShowOnInvoices,
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
      ownerFirstName: input.ownerFirstName,
      ownerLastName: input.ownerLastName,
      contactPhone: input.contactPhone,
      contactEmail: input.contactEmail,
      gstNumber: input.gstNumber,
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2,
      city: input.city,
      state: input.state,
      postalCode: input.postalCode,
      country: input.country,
      logo: input.logo,
      businessDescription: input.businessDescription,
      websiteUrl: input.websiteUrl,
      instagramUrl: input.instagramUrl,
      facebookUrl: input.facebookUrl,
      gstShowOnInvoices: input.gstShowOnInvoices,
      orderNumberPrefix: input.orderNumberPrefix,
      orderNumberNextValue: input.orderNumberNextValue,
      orderNumberPadding: input.orderNumberPadding,
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

/** Marks the onboarding wizard's final step as complete. Deliberately kept
 * separate from `updateTenant` so a later Settings save can never
 * accidentally set (or the wizard's Skip button never accidentally avoid
 * setting) this flag — it only ever changes here. */
export async function markOnboardingComplete(id: string, actorUserId: string) {
  const after = await prisma.organization.update({
    where: { id },
    data: { onboardingCompletedAt: new Date() },
  });

  await audit({
    organizationId: id,
    actorUserId,
    action: "tenant.onboarding_complete",
    recordType: "Organization",
    recordId: id,
    after: { onboardingCompletedAt: after.onboardingCompletedAt },
  });

  return after;
}

const SELF_SERVICE_SLUG_CHANGE_LIMIT = 2;

/**
 * Caterer-facing self-service link change (Chunk 8, pulled forward in
 * minimal form for the Dashboard's "claim your custom link" gate).
 * Deliberately separate from `overrideSlug` below, which stays an
 * unconditional Super Admin bypass — this one enforces the 2-lifetime-change
 * limit `slugChangeCount` was always meant for. The very first self-service
 * change (moving off the random placeholder slug) counts as change #1:
 * `slugChangeCount === 0` means "hasn't set a custom link yet," not "gets a
 * free first change."
 */
export async function setCustomSlug(id: string, newSlug: string, actorUserId: string) {
  const validation = validateSlugFormat(newSlug);
  if (!validation.valid) {
    throw new InvalidSlugError(validation.error);
  }

  const before = await prisma.organization.findUniqueOrThrow({ where: { id } });

  if (before.slug === newSlug) {
    return before;
  }
  if (before.slugChangeCount >= SELF_SERVICE_SLUG_CHANGE_LIMIT) {
    throw new SlugChangeLimitError("You've used all your free custom-link changes. Contact support for further changes.");
  }

  const existing = await prisma.organization.findUnique({ where: { slug: newSlug } });
  if (existing) {
    throw new SlugTakenError(`"${newSlug}" is already in use.`);
  }

  const after = await prisma.organization.update({
    where: { id },
    data: { slug: newSlug, slugChangeCount: { increment: 1 } },
  });

  await audit({
    organizationId: id,
    actorUserId,
    action: "tenant.slug_self_service",
    recordType: "Organization",
    recordId: id,
    before: { slug: before.slug },
    after: { slug: after.slug },
  });

  return after;
}

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

/**
 * Chunk 8 Group 8.3 — the public storefront's tenant lookup. "Published"
 * means the same thing the rest of the app already uses to gate the
 * Dashboard/Settings public-link UI: `slugChangeCount > 0` (the caterer has
 * actually claimed a real slug, not just the random placeholder from
 * signup) — plus `status: ACTIVE`, so a suspended/deactivated tenant's
 * storefront stops resolving the moment Super Admin flips that switch,
 * with no separate "unpublish" flag needed.
 */
export async function getPublishedTenantBySlug(slug: string) {
  return prisma.organization.findFirst({
    where: { slug, status: "ACTIVE", slugChangeCount: { gt: 0 } },
  });
}

/** Feeds `sitemap.xml` — same "published" definition as `getPublishedTenantBySlug`. */
export async function listPublishedTenantSlugs() {
  return prisma.organization.findMany({
    where: { status: "ACTIVE", slugChangeCount: { gt: 0 } },
    select: { slug: true },
  });
}
