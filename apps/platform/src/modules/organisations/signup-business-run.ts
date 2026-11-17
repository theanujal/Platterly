import "server-only";
import { prisma } from "@/lib/db";
import { identityPool } from "../auth/identity-db";
import { runDeliveryBatch } from "../outbox/deliver";
import { getSender } from "../outbox/sender";
import { markPendingVerified } from "./paid-signup-run";
import { createBusinessForSignup, type SignupBusinessResult } from "./signup-business";

/**
 * Called when a person's email is verified (and again, harmlessly, at their first sign-in as a safety net). Reads the product they signed up from, creates their
 * business, then tries at once to hand it to the product so the product has it before the person arrives; a failed hand-over is retried by the outbox worker.
 * Never throws: a person who verified must always be able to sign in, and the next call picks up where this one stopped.
 */
export async function provisionBusinessForVerifiedSignup(subject: string): Promise<SignupBusinessResult | null> {
  try {
    const { rows } = await identityPool().query<{ clientId: string; status: string }>(`select "clientId", "status" from "signupProduct" where "userId" = $1`, [subject]);
    const productKey = rows[0]?.clientId;
    if (!productKey) return null;
    // A paid-plan sign-up has no business until it pays: only the payment window starts here (docs/paid-plan-signup-plan.md).
    if (rows[0].status === "pending_payment") {
      await markPendingVerified(subject);
      return null;
    }
    if (rows[0].status === "completed" || rows[0].status === "invited") return null; // invited: joins the inviter's business, makes none
    const result = await createBusinessForSignup(
      {
        prisma,
        readPerson: async (id) => {
          const found = await identityPool().query<{ email: string; emailVerified: boolean; name: string }>(`select "email", "emailVerified", "name" from "user" where "id" = $1`, [id]);
          return found.rows[0] ?? null;
        },
      },
      { subject, productKey },
    );
    if (!result.ok) console.error(`[signup] no business made for ${subject} on ${productKey}: ${result.reason}`);
    if (result.ok && result.created) await runDeliveryBatch(prisma, getSender(), { limit: 10 }).catch((error) => console.error("[signup] immediate hand-over failed:", error));
    return result;
  } catch (error) {
    console.error("[signup] could not create the business:", error);
    return null;
  }
}
