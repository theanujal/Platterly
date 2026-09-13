"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { setCustomSlug, SlugTakenError, InvalidSlugError, SlugChangeLimitError } from "@/modules/tenants/tenant";
import { validateSlugFormat } from "@/modules/tenants/slug";
import { prisma } from "@/lib/db";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function setCustomSlugAction(newSlug: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ tenant: ["edit"] }, organizationId);

  try {
    await setCustomSlug(organizationId, newSlug, session.user.id);
  } catch (error) {
    if (error instanceof SlugTakenError || error instanceof InvalidSlugError || error instanceof SlugChangeLimitError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function checkSlugAvailableAction(slug: string): Promise<ActionResult> {
  const validation = validateSlugFormat(slug);
  if (!validation.valid) {
    return { ok: false, error: validation.error! };
  }
  const existing = await prisma.organization.findUnique({ where: { slug } });
  if (existing) {
    return { ok: false, error: `"${slug}" is already in use.` };
  }
  return { ok: true };
}
