"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/require-session";
import { prisma } from "@/lib/db";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Chunk 5 Group 5.1 — editing your own name is self-service, not gated by
 * `requirePermission`: it's the account holder's own record, not a
 * tenant-scoped resource. `firstName`/`lastName` are the real stored
 * columns now (AJ, 2026-09-14); `name` is still composed alongside them
 * since Better Auth's core schema requires it.
 */
export async function updateUserProfileAction(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  if (!firstName) {
    return { ok: false, error: "First name is required." };
  }

  const name = lastName ? `${firstName} ${lastName}` : firstName;
  await prisma.user.update({ where: { id: session.user.id }, data: { firstName, lastName: lastName || null, name } });

  revalidatePath("/settings/account/user-profile");
  return { ok: true };
}
