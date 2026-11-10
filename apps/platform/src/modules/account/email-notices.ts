import { sendAuthEmail } from "../auth/mailer";

const NOT_YOU_NOTICE = "Someone asked to change the sign-in email of your Platterly account to another address, but the code was never entered, so nothing was changed. If this was you, you can ignore this. If it was not, sign in to check your recent activity and change your password.";

/** The old address is told, once, that someone tried to change the email and nothing changed. A mail failure is logged without addresses and never breaks the caller. */
export async function sendNotYou(to: string): Promise<void> {
  await sendAuthEmail({ to, subject: "Someone tried to change your Platterly sign-in email", text: NOT_YOU_NOTICE }).catch((error) => console.error("email change attempt notice failed", error instanceof Error ? error.message : "unknown"));
}
