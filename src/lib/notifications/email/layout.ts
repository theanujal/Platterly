/**
 * The one shared layout for every Platterly email (AJ's sample, 2026-10-03): cream page, logo header with a
 * tag on the right, white card with an orange-to-green top bar, eyebrow + title, body, optional code box,
 * optional security note, sign-off and footer. Inline styles and tables only, so mail clients render it.
 */

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export interface EmailLayoutParams {
  /** Small chip at the top right, e.g. "Account Verification". */
  tag: string;
  /** Orange caps line above the title, e.g. "Registration OTP". */
  eyebrow: string;
  title: string;
  greeting: string;
  /** Trusted HTML (build it with `p()` and `escapeHtml`). */
  bodyHtml: string;
  code?: { label: string; value: string; note: string };
  /** Label/value rows in a soft table (order number, event date, amount...). */
  details?: Array<[string, string]>;
  /** Primary button under the body. */
  cta?: { label: string; url: string };
  /** Replaces "Team Platterly" in the sign-off, e.g. the kitchen's name on customer emails. */
  signOff?: string;
  /** Customer emails: the link that opts the customer out of promotional messages, shown under the footer. */
  unsubscribeUrl?: string;
  /** Trusted HTML shown under the code box. */
  afterCodeHtml?: string;
  securityNote?: string;
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

/** A body paragraph. Pass already-escaped HTML. */
export function p(html: string): string {
  return `<p style="margin:0 0 16px;font-size:14px;line-height:1.65;color:#374151;">${html}</p>`;
}

/**
 * The logo. With EMAIL_LOGO_URL set (production: the public address of /platterly-logo.png) it is a normal link, so
 * mail apps show it as part of the email. Without it the logo travels inside the email (cid), which works anywhere but
 * Gmail lists as an attachment.
 */
function logoSrc(): string {
  return process.env.EMAIL_LOGO_URL || "cid:platterly-logo";
}

export function renderEmail(params: EmailLayoutParams): string {
  const { tag, eyebrow, title, greeting, bodyHtml, details, cta, signOff = "Team Platterly", unsubscribeUrl, code, afterCodeHtml = "", securityNote } = params;
  const detailsBox = details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;background:#FFF6EA;border:1px solid #F8DDB8;border-radius:12px;">${details
        .map(
          ([label, value]) =>
            `<tr><td style="padding:10px 18px;font-size:13px;color:#78716C;">${escapeHtml(label)}</td><td align="right" style="padding:10px 18px;font-size:13px;font-weight:700;color:#111827;">${escapeHtml(value)}</td></tr>`,
        )
        .join("")}</table>`
    : "";
  const button = cta
    ? `<p style="margin:4px 0 20px;"><a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:12px 24px;background:#EA580C;color:#FFFFFF;font-size:14px;font-weight:700;text-decoration:none;border-radius:10px;">${escapeHtml(cta.label)}</a></p>`
    : "";
  const codeBox = code
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;background:#FFF6EA;border:1px solid #F8DDB8;border-radius:16px;">
        <tr>
          <td style="padding:18px 20px;">
            <div style="font-size:13px;font-weight:700;color:#9A3412;">${escapeHtml(code.label)}</div>
            <div style="margin-top:6px;font-size:13px;color:#78716C;">${escapeHtml(code.note)}</div>
          </td>
          <td align="right" style="padding:18px 20px;">
            <span style="display:inline-block;padding:12px 20px;background:#FFFFFF;border:1px dashed #F0A878;border-radius:12px;font-size:24px;font-weight:800;letter-spacing:4px;color:#D9531E;">${escapeHtml(code.value)}</span>
          </td>
        </tr>
      </table>`
    : "";
  const unsubscribe = unsubscribeUrl
    ? `<div style="margin-top:8px;font-size:12px;color:#9CA3AF;">Don't want promotional emails? <a href="${escapeHtml(unsubscribeUrl)}" style="color:#9CA3AF;text-decoration:underline;">Unsubscribe</a>. You will still get messages about your orders.</div>`
    : "";
  const note = securityNote
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;background:#F8FAFC;border-radius:12px;">
        <tr><td style="padding:14px 18px;font-size:12px;line-height:1.6;color:#64748B;"><strong style="color:#374151;">Security note:</strong> ${escapeHtml(securityNote)}</td></tr>
      </table>`
    : "";

  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#FFFAF2;font-family:${FONT};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFFAF2;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;">
      <tr><td style="padding:0 0 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:middle;"><img src="${logoSrc()}" alt="Platterly" width="140" height="32" style="display:block;border:0;height:32px;width:140px;"></td>
          <td align="right" style="vertical-align:middle;"><span style="display:inline-block;padding:5px 14px;background:#FDEBD3;color:#B8400E;font-size:12px;font-weight:700;">${escapeHtml(tag)}</span></td>
        </tr></table>
      </td></tr>
      <tr><td style="background:#FFFFFF;border:1px solid #F3EADB;border-radius:20px;overflow:hidden;">
        <div style="height:6px;background:#F07B3F;background-image:linear-gradient(90deg,#F07B3F,#E8A93A,#5DBB63);"></div>
        <div style="padding:32px 36px;">
          <div style="font-size:12px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#D9531E;">${escapeHtml(eyebrow)}</div>
          <h1 style="margin:12px 0 20px;font-size:24px;line-height:1.25;font-weight:800;color:#111827;">${escapeHtml(title)}</h1>
          ${p(escapeHtml(greeting))}
          ${bodyHtml}
          ${detailsBox}
          ${button}
          ${codeBox}
          ${afterCodeHtml}
          ${note}
        </div>
      </td></tr>
      <tr><td style="padding:28px 8px 0;">
        <div style="font-size:14px;color:#374151;">Best regards,</div>
        <div style="font-size:14px;font-weight:800;color:#111827;">${escapeHtml(signOff)}</div>
        <div style="margin-top:16px;font-size:12px;color:#9CA3AF;">This is an automated email from Platterly. Please do not reply to this email.</div>
        ${unsubscribe}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}
