import "server-only";

/**
 * WhatsApp sender (Wacrm API, https://<host>/api/v1/messages). Platterly only ever messages a kitchen's own team,
 * never its customers (AJ, 2026-10-09). While `WACRM_TEST_TO` is set every message is redirected to that one number,
 * whoever the real recipient is, so a test run can never reach anyone else.
 *
 * Outside WhatsApp's 24-hour window only an approved template is accepted. A message goes as its template once that
 * template's name is listed in `WACRM_TEMPLATES_APPROVED` (comma separated); until then it goes as plain text.
 */

export interface WacrmConfig {
  baseUrl: string;
  apiKey: string;
  testTo?: string;
  approvedTemplates: string[];
  templateLanguage: string;
}

export type WacrmResult = { status: "sent"; providerMessageId: string; to: string } | { status: "failed"; reason: string; to: string };

/** Null when unconfigured, and always null under Vitest so a test run can never send a real message. */
export function wacrmConfig(env: NodeJS.ProcessEnv = process.env): WacrmConfig | null {
  if (env.VITEST) return null;
  const baseUrl = env.WACRM_BASE_URL?.trim().replace(/\/+$/, "");
  const apiKey = env.WACRM_API_KEY?.trim();
  if (!baseUrl || !apiKey) return null;
  return {
    baseUrl,
    apiKey,
    testTo: env.WACRM_TEST_TO?.trim() || undefined,
    approvedTemplates: (env.WACRM_TEMPLATES_APPROVED ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    templateLanguage: env.WACRM_TEMPLATE_LANGUAGE?.trim() || "en_US",
  };
}

/** The number a message really goes to: the test number when one is set, else the intended one. */
export function resolveRecipient(config: Pick<WacrmConfig, "testTo">, to: string): string {
  return config.testTo ?? to;
}

export async function sendWacrmMessage(
  config: WacrmConfig,
  params: { to: string; text: string; template: { name: string; params: string[] } },
  fetchFn: typeof fetch = fetch,
): Promise<WacrmResult> {
  const to = resolveRecipient(config, params.to);
  const body = config.approvedTemplates.includes(params.template.name)
    ? { to, type: "template", template: { name: params.template.name, language: config.templateLanguage, params: params.template.params } }
    : { to, type: "text", text: params.text };
  try {
    const response = await fetchFn(`${config.baseUrl}/api/v1/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await response.json().catch(() => null)) as { data?: { whatsapp_message_id?: string }; error?: { message?: string } | string } | null;
    if (response.ok && json?.data?.whatsapp_message_id) return { status: "sent", providerMessageId: json.data.whatsapp_message_id, to };
    const error = typeof json?.error === "string" ? json.error : json?.error?.message;
    return { status: "failed", reason: `HTTP ${response.status}${error ? `: ${error}` : ""}`, to };
  } catch (error) {
    return { status: "failed", reason: error instanceof Error ? error.message : "Request failed", to };
  }
}
