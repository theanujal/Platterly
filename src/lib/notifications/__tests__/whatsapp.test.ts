import { describe, it, expect, vi } from "vitest";
import { cleanParam, renderTemplate, WHATSAPP_TEMPLATES } from "../whatsapp/templates";
import { resolveRecipient, sendWacrmMessage, wacrmConfig, type WacrmConfig } from "../whatsapp/wacrm";

const config: WacrmConfig = { baseUrl: "https://wacrm.test", apiKey: "k", testTo: "+918860756024", approvedTemplates: ["platterly_new_order"], templateLanguage: "en_US" };
const ok = () => vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { whatsapp_message_id: "wamid.1" } }), { status: 201 }));

describe("WhatsApp to the kitchen team (Wacrm)", () => {
  it("never sends to anyone but the test number while WACRM_TEST_TO is set", async () => {
    const fetchFn = ok();
    const result = await sendWacrmMessage(config, { to: "+919999999999", text: "hi", template: { name: "platterly_new_order", params: ["1"] } }, fetchFn);
    expect(JSON.parse(fetchFn.mock.calls[0][1].body).to).toBe("+918860756024");
    expect(result).toMatchObject({ status: "sent", to: "+918860756024", providerMessageId: "wamid.1" });
    expect(resolveRecipient({ testTo: undefined }, "+919999999999")).toBe("+919999999999");
  });

  it("sends an approved template as a template and an unapproved one as plain text", async () => {
    const fetchFn = ok();
    await sendWacrmMessage(config, { to: "+91x", text: "T", template: { name: "platterly_new_order", params: ["a", "b", "c"] } }, fetchFn);
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toMatchObject({ type: "template", template: { name: "platterly_new_order", language: "en_US", params: ["a", "b", "c"] } });
    await sendWacrmMessage(config, { to: "+91x", text: "T", template: { name: "platterly_menu_sent", params: [] } }, fetchFn);
    expect(JSON.parse(fetchFn.mock.calls[1][1].body)).toMatchObject({ type: "text", text: "T" });
  });

  it("reports a rejected or unreachable send as failed", async () => {
    const rejected = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "meta_error" }), { status: 502 }));
    expect(await sendWacrmMessage(config, { to: "+91x", text: "T", template: { name: "x", params: [] } }, rejected)).toMatchObject({ status: "failed", reason: "HTTP 502: meta_error" });
    const down = vi.fn().mockRejectedValue(new Error("offline"));
    expect(await sendWacrmMessage(config, { to: "+91x", text: "T", template: { name: "x", params: [] } }, down)).toMatchObject({ status: "failed", reason: "offline" });
  });

  it("is switched off under Vitest, and unconfigured without a key", () => {
    expect(wacrmConfig({ VITEST: "1", WACRM_BASE_URL: "https://x", WACRM_API_KEY: "k" } as never)).toBeNull();
    expect(wacrmConfig({} as never)).toBeNull();
    expect(wacrmConfig({ WACRM_BASE_URL: "https://x/", WACRM_API_KEY: "k", WACRM_TEMPLATES_APPROVED: "a, b" } as never)).toMatchObject({ baseUrl: "https://x", approvedTemplates: ["a", "b"], templateLanguage: "en_US" });
  });

  it("keeps template variables on one line and fills the plain-text fallback", () => {
    expect(cleanParam("Anita\n  Sharma\t")).toBe("Anita Sharma");
    expect(cleanParam(undefined)).toBe("-");
    expect(renderTemplate(WHATSAPP_TEMPLATES["order.new_alert"].body, ["ORD-1", "Anita", "14 Nov"])).toBe("New order ORD-1 from Anita for 14 Nov. Open Platterly to review it.");
    expect(Object.keys(WHATSAPP_TEMPLATES)).toHaveLength(7);
  });
});
