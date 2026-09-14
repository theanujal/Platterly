"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/require-session";
import { prisma } from "@/lib/db";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Chunk 5 Group 5.1 — editing your own name is self-service, not gated by
 * `requirePermission`: it's the account holder's own record, not a
 * tenant-scoped resource. `User.name` stays a single field (no schema
 * change here, per the chunk's "does not re-model User Profile" boundary)
 * — the form splits it into first/last purely for display/edit, joining
 * back into one string on save.
 */
export async function updateUserProfileAction(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  if (!firstName) {
    return { ok: false, error: "First name is required." };
  }

  const name = lastName ? `${firstName} ${lastName}` : firstName;
  await prisma.user.update({ where: { id: session.user.id }, data: { name } });

  revalidatePath("/settings/account/user-profile");
  return { ok: true };
}
