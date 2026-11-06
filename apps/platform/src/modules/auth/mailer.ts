import "server-only";

// F4 auth email. D5 (sender domain and templates for auth emails) is OPEN, so there is no production sender and no approved template here.
// This module only knows the ZeptoMail REST shape that Caterly and the local mail sink already speak. It sends through whatever
// ZEPTOMAIL_API_URL / ZEPTOMAIL_TOKEN / ZEPTOMAIL_FROM say; with any of them missing it THROWS. (The identity provider sends in the background, so the person sees the same answer either way and uses
// "Resend code"; the failure is logged on the server.) Locally the launcher points it at the mail sink (port 3600), so nothing leaves the machine. The wording below is a
// plain placeholder for development, not a template anyone approved.
export type AuthEmail = { to: string; subject: string; text: string };

export class MailNotConfiguredError extends Error {}
export class MailDeliveryError extends Error {}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

export async function sendAuthEmail(mail: AuthEmail, env: Record<string, string | undefined> = process.env): Promise<void> {
  const url = env.ZEPTOMAIL_API_URL;
  const token = env.ZEPTOMAIL_TOKEN;
  const from = env.ZEPTOMAIL_FROM;
  if (!url || !token || !from) throw new MailNotConfiguredError("auth email is not configured (D5 is open: no production sender is defined)");
  const response = await fetch(url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", authorization: token.startsWith("Zoho-enczapikey") ? token : `Zoho-enczapikey ${token}` },
    body: JSON.stringify({ from: { address: from, name: "Platterly" }, to: [{ email_address: { address: mail.to } }], subject: mail.subject, htmlbody: `<p style="white-space:pre-line">${escapeHtml(mail.text)}</p>` }),
  });
  if (!response.ok) throw new MailDeliveryError(`the mail service answered ${response.status}`);
}

export type OtpKind = "sign-in" | "email-verification" | "forget-password" | "change-email";

/** The placeholder wording for each kind of code. The code itself is the only secret in the message. */
export function otpEmail(to: string, otp: string, kind: OtpKind): AuthEmail {
  const purpose = kind === "forget-password" ? "reset your Platterly password" : kind === "change-email" ? "confirm your new Platterly email address" : kind === "sign-in" ? "sign in to Platterly" : "verify your Platterly email address";
  return { to, subject: `Your Platterly code: ${otp}`, text: `Use this code to ${purpose}:\n\n${otp}\n\nIt expires in 10 minutes. If you did not ask for it, you can ignore this message.` };
}
