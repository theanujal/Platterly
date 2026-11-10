import { emailChangeAttemptEmail } from "../auth/email-templates";
import { sendAuthEmail } from "../auth/mailer";

/** The old address is told, once, that someone tried to change the email and nothing changed. A mail failure is logged without addresses and never breaks the caller. */
export async function sendNotYou(to: string): Promise<void> {
  await sendAuthEmail({ to, ...emailChangeAttemptEmail() }).catch((error) => console.error("email change attempt notice failed", error instanceof Error ? error.message : "unknown"));
}
