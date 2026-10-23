import "server-only";

/**
 * Zoho ZeptoMail transport (REST API v1.1). Configured by three env vars; with no token set nothing is sent
 * and callers keep the log-only behaviour, so dev and CI never need credentials.
 *   ZEPTOMAIL_TOKEN     the Send Mail token from ZeptoMail (with or without the "Zoho-enczapikey " prefix)
 *   ZEPTOMAIL_FROM      the verified sender address, e.g. noreply@platterly.in
 *   ZEPTOMAIL_API_URL   optional; defaults to the India data centre
 */
const DEFAULT_API_URL = "https://api.zeptomail.in/v1.1/email";

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  fromName?: string;
  replyTo?: string;
}

export type SendEmailResult = { status: "sent"; providerMessageId: string | null } | { status: "skipped"; reason: string } | { status: "failed"; reason: string };

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const token = process.env.ZEPTOMAIL_TOKEN;
  const from = process.env.ZEPTOMAIL_FROM;
  if (!token || !from) return { status: "skipped", reason: "ZeptoMail is not configured." };

  try {
    const response = await fetch(process.env.ZEPTOMAIL_API_URL ?? DEFAULT_API_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: token.startsWith("Zoho-enczapikey") ? token : `Zoho-enczapikey ${token}`,
      },
      body: JSON.stringify({
        from: { address: from, name: params.fromName ?? "Platterly" },
        to: [{ email_address: { address: params.to } }],
        ...(params.replyTo ? { reply_to: [{ address: params.replyTo }] } : {}),
        subject: params.subject,
        htmlbody: params.html,
      }),
    });
    const body = (await response.json().catch(() => null)) as ZeptoBody | null;
    if (!response.ok) return { status: "failed", reason: `ZeptoMail ${response.status}: ${rejectionReason(body)}` };
    return { status: "sent", providerMessageId: body?.request_id ?? null };
  } catch (error) {
    return { status: "failed", reason: error instanceof Error ? error.message : "Network error" };
  }
}

type ZeptoBody = { request_id?: string; message?: string; error?: { message?: string; details?: { code?: string; message?: string }[] } };

// ZeptoMail puts its reason in an error object, e.g. {"error":{"message":"Resource Limit Exhausted.","details":[{"code":"LE_102","message":"Credit exhausted"}]}}.
function rejectionReason(body: ZeptoBody | null): string {
  const detail = body?.error?.details?.[0];
  const extra = detail?.message ? ` (${[detail.code, detail.message].filter(Boolean).join(": ")})` : "";
  return (body?.error?.message ?? body?.message ?? "request rejected") + extra;
}
