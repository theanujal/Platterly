import { escapeHtml, p, renderEmail } from "./email-layout";

// The sign-in system's emails, in the approved Platterly layout (email-layout.ts, the same one Caterly uses).
// APPROVED by AJ (Caterly's own sign-up and reset emails, used word for word): `verificationCodeEmail`, `passwordResetEmail`.
// DRAFTS, awaiting AJ's approval of every text (2026-11-10): all the others. Plain subject and text are kept next to the html so a mail client without html and the tests can read them.
export type RenderedAuthEmail = { subject: string; html: string; text: string };

const SECURITY_NOTE = "Platterly will never ask you to share your OTP, password, or account access details outside the platform.";

const plain = (...paragraphs: string[]) => paragraphs.join("\n\n");

/** The 6-digit sign-up code. APPROVED (Caterly's "Platterly Account Verification"). */
export function verificationCodeEmail(code: string, expiresInMinutes: number): RenderedAuthEmail {
  return {
    subject: "Platterly Account Verification",
    html: renderEmail({
      tag: "Account Verification",
      eyebrow: "Registration OTP",
      title: "Verify your Platterly account",
      greeting: "Dear Caterer,",
      bodyHtml: p("Welcome to Platterly. Use the verification code below to complete your registration and activate your account."),
      code: { label: "Your verification code", value: code, note: `Valid for ${expiresInMinutes} minutes` },
      afterCodeHtml:
        p(`This code is valid for <strong>${expiresInMinutes} minutes</strong>. For your security, please do not share this code with anyone.`) +
        p("If you did not request this code, you can safely ignore this email."),
      securityNote: SECURITY_NOTE,
    }),
    text: plain("Welcome to Platterly. Use this verification code to complete your registration:", code, `It is valid for ${expiresInMinutes} minutes. If you did not request it, you can ignore this email.`),
  };
}

/** The password reset code. APPROVED (Caterly's "Reset Your Platterly Password"). */
export function passwordResetEmail(code: string, expiresInMinutes: number): RenderedAuthEmail {
  return {
    subject: "Reset Your Platterly Password",
    html: renderEmail({
      tag: "Password Reset",
      eyebrow: "Reset your password",
      title: "Reset your Platterly password",
      greeting: "Hello,",
      bodyHtml: p("We received a request to reset the password for your Platterly account. Use the code below to choose a new one."),
      code: { label: "Your reset code", value: code, note: `Valid for ${expiresInMinutes} minutes` },
      afterCodeHtml: p("If you did not ask to reset your password, you can safely ignore this email. Your password will not change."),
      securityNote: SECURITY_NOTE,
    }),
    text: plain("We received a request to reset the password for your Platterly account. Use this code to choose a new one:", code, `It is valid for ${expiresInMinutes} minutes. If you did not ask for it, you can ignore this email.`),
  };
}

type CodeKind = "change-email" | "recovery-email" | "sign-in";

/** A code sent for something other than sign-up or reset: confirming a new sign-in email, a recovery email, or a sign-in. */
export function otherCodeEmail(kind: CodeKind, code: string, expiresInMinutes: number): RenderedAuthEmail {
  const t = {
    "change-email": { subject: "Confirm Your New Platterly Email", tag: "Email Change", eyebrow: "Confirm your new email", title: "Confirm your new Platterly email", body: "Use the code below to confirm this address as the new sign-in email for your Platterly account.", label: "Your confirmation code", ignore: "If you did not ask to change your email, you can safely ignore this email. Nothing will change." },
    "recovery-email": { subject: "Confirm Your Platterly Recovery Email", tag: "Recovery Email", eyebrow: "Confirm your recovery email", title: "Confirm your recovery email", body: "Use the code below to confirm this address as the recovery email for your Platterly account.", label: "Your confirmation code", ignore: "If you did not ask for this, you can safely ignore this email. The address will not be added." },
    "sign-in": { subject: "Your Platterly Sign-in Code", tag: "Sign-in Code", eyebrow: "Sign in", title: "Your Platterly sign-in code", body: "Use the code below to sign in to your Platterly account.", label: "Your sign-in code", ignore: "If you did not try to sign in, you can safely ignore this email, and consider changing your password." },
  }[kind];
  return {
    subject: t.subject,
    html: renderEmail({ tag: t.tag, eyebrow: t.eyebrow, title: t.title, greeting: "Hello,", bodyHtml: p(t.body), code: { label: t.label, value: code, note: `Valid for ${expiresInMinutes} minutes` }, afterCodeHtml: p(t.ignore), securityNote: SECURITY_NOTE }),
    text: plain(t.body, code, `It is valid for ${expiresInMinutes} minutes. ${t.ignore}`),
  };
}

type Notice = { subject: string; tag: string; eyebrow: string; title: string; paragraphs: string[]; cta?: { label: string; url: string }; after?: string[] };

function notice(n: Notice): RenderedAuthEmail {
  return {
    subject: n.subject,
    html: renderEmail({ tag: n.tag, eyebrow: n.eyebrow, title: n.title, greeting: "Hello,", bodyHtml: n.paragraphs.map((x) => p(escapeHtml(x))).join(""), cta: n.cta, afterCodeHtml: (n.after ?? []).map((x) => p(escapeHtml(x))).join(""), securityNote: SECURITY_NOTE }),
    text: plain(...n.paragraphs, ...(n.cta ? [`${n.cta.label}: ${n.cta.url}`] : []), ...(n.after ?? [])),
  };
}

/** To the OLD address when the sign-in email was changed: with the 24-hour cancel link. */
export const signInEmailChangedEmail = (newEmail: string, cancelUrl: string, cancelHours: number) =>
  notice({
    subject: "Your Platterly sign-in email was changed",
    tag: "Security Alert",
    eyebrow: "Sign-in email changed",
    title: "Your Platterly sign-in email was changed",
    paragraphs: [`The sign-in email for your Platterly account was just changed to ${newEmail}.`, "If this was you, there is nothing to do.", `If this was not you, cancel the change within ${cancelHours} hours. You will be asked why, your account will be put on hold, and the Platterly team will verify that it is really you.`],
    cta: { label: "Cancel this change", url: cancelUrl },
  });

/** To the NEW address when the sign-in email was changed. */
export const newSignInEmailWelcome = () =>
  notice({ subject: "This is now your Platterly sign-in email", tag: "Account Update", eyebrow: "Sign-in email changed", title: "This is now your Platterly sign-in email", paragraphs: ["Your Platterly account now uses this address to sign in.", "For your security you were signed out on all devices. Sign in again with this address and your password."] });

/** To the old address when someone started an email change but never entered the code. */
export const emailChangeAttemptEmail = () =>
  notice({ subject: "Someone tried to change your Platterly sign-in email", tag: "Security Alert", eyebrow: "Email change not completed", title: "Someone tried to change your sign-in email", paragraphs: ["Someone asked to change the sign-in email of your Platterly account to another address, but the code was never entered, so nothing was changed."], after: ["If this was you, you can ignore this email. If it was not, sign in to check your recent activity and change your password."] });

/** To both addresses when the old address cancelled a change. */
export const emailChangeCancelledEmail = () =>
  notice({ subject: "A Platterly email change was cancelled", tag: "Security Alert", eyebrow: "Email change cancelled", title: "A Platterly email change was cancelled", paragraphs: ["The change of sign-in email on this Platterly account was cancelled. The sign-in email is back to the original address and everyone was signed out.", "The account is on hold until Platterly has verified the owner, so signing in will not work until then."], after: ["If this was not you, contact Platterly support."] });

/** After a password change. */
export const passwordChangedEmail = () =>
  notice({ subject: "Your Platterly password was changed", tag: "Security Alert", eyebrow: "Password changed", title: "Your Platterly password was changed", paragraphs: ["The password for your Platterly account was just changed, and you were signed out on your other devices."], after: ["If this was not you, reset your password now and contact Platterly support."] });

/** After a recovery email change; `what` says what happened. */
export const recoveryEmailChangedEmail = (what: string) =>
  notice({ subject: "Your Platterly recovery email changed", tag: "Security Alert", eyebrow: "Recovery email changed", title: "Your Platterly recovery email changed", paragraphs: [what], after: ["If this was not you, reset your password now and contact Platterly support."] });

/** After two-step verification was switched on or off. */
export const twoFactorChangedEmail = (on: boolean) =>
  notice({ subject: `Two-step verification was turned ${on ? "on" : "off"} on your Platterly account`, tag: "Security Alert", eyebrow: "Two-step verification", title: `Two-step verification was turned ${on ? "on" : "off"}`, paragraphs: [`Two-step verification was just turned ${on ? "on" : "off"} on your Platterly account.`], after: ["If this was not you, reset your password now and contact Platterly support."] });

/** After an account deletion request. */
export const deletionRequestEmail = () =>
  notice({ subject: "We received your Platterly account deletion request", tag: "Account Update", eyebrow: "Deletion request", title: "We received your deletion request", paragraphs: ["We received a request to delete your Platterly account. Our team reviews every request and will contact you before anything is deleted."], after: ["If you did not ask for this, sign in and withdraw the request on your Profile page, then change your password."] });

/** Optional alert (Account notification choice): a sign-in from a browser or system not seen before. `device` is a plain label, never an address. */
export const newSignInAlertEmail = (device: string, when: string) =>
  notice({
    subject: "New sign-in to your Platterly account",
    tag: "Security Alert",
    eyebrow: "New sign-in",
    title: "New sign-in to your Platterly account",
    paragraphs: [`Your Platterly account was just signed in to from ${device} (${when}).`, "If this was you, there is nothing to do."],
    after: ["If this was not you, change your password now in your Account and turn on two-step verification. You can switch this alert off under Notifications in your Account."],
  });

/** Optional alert (Account notification choice), for when apps can be connected (M3): another app was given access to the account. `app` is the app's name. */
export const thirdPartyAccessAlertEmail = (app: string) =>
  notice({
    subject: "An app was given access to your Platterly account",
    tag: "Security Alert",
    eyebrow: "App access",
    title: "An app was given access to your account",
    paragraphs: [`An app called ${app} was just given access to your Platterly account.`, "If this was you, there is nothing to do."],
    after: ["If this was not you, remove the app's access in your Account and change your password now. You can switch this alert off under Notifications in your Account."],
  });

// Admin transfer by invitation (AJ, 2026-11-10 / 2026-11-13). All six approved by AJ, 2026-11-13.

/** To the person invited to become the Business Admin. */
export const adminTransferInviteEmail = (businessName: string, fromName: string, acceptUrl: string, days: number) =>
  notice({
    subject: `${fromName} invited you to be the Business Admin of ${businessName}`,
    tag: "Business Admin",
    eyebrow: "Invitation",
    title: `Become the Business Admin of ${businessName}`,
    paragraphs: [`${fromName} has invited you to take over as the Business Admin of ${businessName} on Platterly.`, "The Business Admin owns the business account: its plan, billing and who looks after it. If you accept, the current Admin stays on as a member who can see everything but cannot change anything, until you remove them.", `This invitation works for ${days} days. If you do not have a Platterly account yet, you will be asked to create one with this email address.`],
    cta: { label: "View the invitation", url: acceptUrl },
    after: ["If you were not expecting this, you can ignore this email. Nothing changes unless you accept."],
  });

/** To the current Admin when they send an invitation (a record, and a warning if it was not them). */
export const adminTransferSentEmail = (nomineeEmail: string, businessName: string, days: number) =>
  notice({
    subject: "You invited someone to be the Business Admin",
    tag: "Security Alert",
    eyebrow: "Admin transfer",
    title: "You invited someone to be the Business Admin",
    paragraphs: [`You invited ${nomineeEmail} to take over as the Business Admin of ${businessName}.`, `Nothing changes until they accept. The invitation ends after ${days} days, and you can withdraw it any time before then in your Account, under Admin role.`],
    after: ["If this was not you, withdraw the invitation in your Account now, change your password and contact Platterly support."],
  });

/** To the old Admin when the invitation is accepted. */
export const adminTransferAcceptedEmail = (businessName: string, newAdminEmail: string) =>
  notice({
    subject: `${newAdminEmail} is now the Business Admin of ${businessName}`,
    tag: "Business Admin",
    eyebrow: "Admin transfer",
    title: "The Business Admin role has moved",
    paragraphs: [`${newAdminEmail} accepted your invitation and is now the Business Admin of ${businessName}.`, "You stay on as a member who can see everything but cannot change anything, and you can no longer manage the plan or billing. The new Admin can remove you."],
  });

/** To the new Admin once the role has moved. */
export const adminTransferWelcomeEmail = (businessName: string) =>
  notice({
    subject: `You are now the Business Admin of ${businessName}`,
    tag: "Business Admin",
    eyebrow: "Admin transfer",
    title: `You are now the Business Admin of ${businessName}`,
    paragraphs: [`You accepted the invitation and now own the business account for ${businessName}: its plan, billing and who looks after it.`, "The previous Admin stays on as a member who cannot change anything. You can remove them from the Team page in your product."],
  });

/** To the Admin when the invited person says no. */
export const adminTransferDeclinedEmail = (nomineeEmail: string, businessName: string) =>
  notice({ subject: "Your Business Admin invitation was declined", tag: "Business Admin", eyebrow: "Admin transfer", title: "Your invitation was declined", paragraphs: [`${nomineeEmail} declined your invitation to become the Business Admin of ${businessName}. You are still the Admin, and you can invite someone else.`] });

/** To the invited person when the Admin withdraws the invitation. */
export const adminTransferCancelledEmail = (businessName: string) =>
  notice({ subject: "A Business Admin invitation was withdrawn", tag: "Business Admin", eyebrow: "Admin transfer", title: "The invitation was withdrawn", paragraphs: [`The invitation to become the Business Admin of ${businessName} was withdrawn, so the link no longer works.`], after: ["There is nothing you need to do."] });
