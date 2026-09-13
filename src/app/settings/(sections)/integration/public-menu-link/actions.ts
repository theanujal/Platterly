"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { setCustomSlug, SlugTakenError, InvalidSlugError, SlugChangeLimitError } from "@/modules/tenants/tenant";
import { validateSlugFormat } from "@/modules/tenants/slug";
import { prisma } from "@/lib/db";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Chunk 5 Group 5.4 — moved here from the Dashboard's original stopgap
 * location (`src/app/dashboard/actions.ts`, which now just re-exports these
 * so the Dashboard's existing nudge dialog keeps working unchanged). This is
 * the real, persistent home for editing the public link.
 */
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
  revalidatePath("/settings/integration/public-menu-link");
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
