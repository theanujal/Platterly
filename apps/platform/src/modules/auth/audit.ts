import "server-only";
import { prisma } from "@/lib/db";
import { writeAudit } from "../audit/write-audit";

// F4.3.2 auth-event audit: sign-in, refused sign-in and sign-out are written to the Platform audit log. A failure to write never blocks the sign-in
// itself (the person is not punished for a logging fault), but it is logged on the server.
export type AuthEvent = { action: "auth.sign_in" | "auth.sign_out"; outcome: "done" | "refused"; userId?: string; reasonCode?: string; requestId?: string };

export async function auditAuthEvent(event: AuthEvent): Promise<void> {
  try {
    await prisma.$transaction((tx) =>
      writeAudit(tx, {
        action: event.action,
        outcome: event.outcome,
        initiator: event.userId ? { kind: "user", ref: event.userId } : { kind: "system", ref: "unauthenticated" },
        executor: { kind: "system", ref: "account-auth" },
        subject: event.userId ? { type: "user", id: event.userId } : undefined,
        reasonCode: event.reasonCode,
        requestId: event.requestId,
      }),
    );
  } catch (error) {
    console.error("auth audit write failed", error instanceof Error ? error.message : "unknown");
  }
}
