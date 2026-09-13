"use server";

import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { requireSession } from "@/lib/auth/require-session";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * better-auth's own `acceptInvitation` creates the Member row and sets the
 * active organization itself (see crud-invites.mjs) — this is a thin
 * wrapper, not a reimplementation.
 */
export async function acceptInvitationAction(invitationId: string): Promise<ActionResult> {
  await requireSession();

  try {
    await auth.api.acceptInvitation({ headers: await nextHeaders(), body: { invitationId } });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not accept this invitation." };
  }

  redirect("/dashboard");
}
