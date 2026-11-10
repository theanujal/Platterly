import "server-only";

// F4 auth email. D5 (sender domain and templates for auth emails) is OPEN, so there is no production sender and no approved template here.
// This module only knows the ZeptoMail REST shape that Caterly and the local mail sink already speak. It sends through whatever
// ZEPTOMAIL_API_URL / ZEPTOMAIL_TOKEN / ZEPTOMAIL_FROM say; with any of them missing it THROWS. (The identity provider sends in the background, so the person sees the same answer either way and uses
// "Resend code"; the failure is logged on the server.) Locally the launcher points it at the mail sink (port 3600), so nothing leaves the machine. The wording below is a
// plain placeholder for development, not a template anyone approved.
import { mailGuard } from "@platterly/contract";
import { OTP } from "./config";
import { otherCodeEmail, passwordResetEmail, verificationCodeEmail } from "./email-templates";

export type AuthEmail = { to: string; subject: string; text: string; /** The branded html; without it the text is sent as plain paragraphs. */ html?: string };

export class MailNotConfiguredError extends Error {}
export class MailDeliveryError extends Error {}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

export async function sendAuthEmail(mail: AuthEmail, env: Record<string, string | undefined> = process.env): Promise<void> {
  const url = env.ZEPTOMAIL_API_URL;
  const token = env.ZEPTOMAIL_TOKEN;
  const from = env.ZEPTOMAIL_FROM;
  if (!url || !token || !from) throw new MailNotConfiguredError("auth email is not configured (D5 is open: no production sender is defined)");
  // Before go-live a real send goes only to the allowed address; the local sink is never restricted. A blocked message is logged without its address and dropped.
  const guard = mailGuard(mail.to, url, env);
  if (!guard.allowed) {
    console.warn(`[mail-guard] ${guard.reason} (subject: ${mail.subject.replace(/\d{6}/g, "******")})`);
    return;
  }
  const response = await fetch(url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", authorization: token.startsWith("Zoho-enczapikey") ? token : `Zoho-enczapikey ${token}` },
    body: JSON.stringify({ from: { address: from, name: "Platterly" }, to: [{ email_address: { address: mail.to } }], subject: mail.subject, htmlbody: mail.html ?? `<p style="white-space:pre-line">${escapeHtml(mail.text)}</p>` }),
  });
  if (!response.ok) throw new MailDeliveryError(`the mail service answered ${response.status}`);
}

export type OtpKind = "sign-in" | "email-verification" | "forget-password" | "change-email";

/** The email for each kind of code, in the approved layout (see email-templates.ts: sign-up and reset are Caterly's approved emails, word for word). */
export function otpEmail(to: string, otp: string, kind: OtpKind): AuthEmail {
  const minutes = OTP.expiresInSeconds / 60;
  const rendered = kind === "email-verification" ? verificationCodeEmail(otp, minutes) : kind === "forget-password" ? passwordResetEmail(otp, minutes) : otherCodeEmail(kind, otp, minutes);
  return { to, ...rendered };
}
