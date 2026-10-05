/**
 * The Platterly email layout (the same look as catering's shared one): cream page, logo header with a tag, white card with an
 * orange-to-green top bar, eyebrow and title, body, optional details table and button, sign-off. Inline styles and tables only.
 */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** A body paragraph. Pass already-escaped HTML. */
export function p(html: string): string {
  return `<p style="margin:0 0 16px;font-size:14px;line-height:1.65;color:#374151;">${html}</p>`;
}

export interface EmailLayoutParams {
  tag: string;
  eyebrow: string;
  title: string;
  greeting: string;
  /** Trusted HTML (build it with `p()` and `escapeHtml`). */
  bodyHtml: string;
  details?: Array<[string, string]>;
  cta?: { label: string; url: string };
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

export function renderEmail({ tag, eyebrow, title, greeting, bodyHtml, details, cta }: EmailLayoutParams): string {
  const detailsBox = details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;background:#FFF6EA;border:1px solid #F8DDB8;border-radius:12px;">${details
        .map(([label, value]) => `<tr><td style="padding:10px 18px;font-size:13px;color:#78716C;">${escapeHtml(label)}</td><td align="right" style="padding:10px 18px;font-size:13px;font-weight:700;color:#111827;">${escapeHtml(value)}</td></tr>`)
        .join("")}</table>`
    : "";
  const button = cta ? `<p style="margin:4px 0 20px;"><a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:12px 24px;background:#EA580C;color:#FFFFFF;font-size:14px;font-weight:700;text-decoration:none;border-radius:10px;">${escapeHtml(cta.label)}</a></p>` : "";
  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#FFFAF2;font-family:${FONT};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFFAF2;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;">
      <tr><td style="padding:0 0 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:middle;"><img src="${process.env.EMAIL_LOGO_URL || "cid:platterly-logo"}" alt="Platterly" width="140" height="32" style="display:block;border:0;height:32px;width:140px;"></td>
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
        </div>
      </td></tr>
      <tr><td style="padding:28px 8px 0;">
        <div style="font-size:14px;color:#374151;">Best regards,</div>
        <div style="font-size:14px;font-weight:800;color:#111827;">Team Platterly</div>
        <div style="margin-top:16px;font-size:12px;color:#9CA3AF;">This is an automated email from Platterly. Please do not reply to this email.</div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}
