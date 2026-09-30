import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  ChannelProviderNotConnectedError,
  InvalidChannelTemplateError,
  getChannelSettings,
  setChannelActive,
  setChannelMessages,
  setChannelProviderConnected,
  setChannelTemplate,
} from "@/modules/notifications/channel-settings";
import { CHANNEL_CONFIG } from "@/modules/notifications/channel-settings-config";

const cleanupOrgIds: string[] = [];

afterEach(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: cleanupOrgIds } } });
  cleanupOrgIds.length = 0;
});

async function makeOrg() {
  const org = await prisma.organization.create({
    data: { id: crypto.randomUUID(), name: "Channel Org", slug: `ch-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() },
  });
  cleanupOrgIds.push(org.id);
  return org;
}

describe("channel settings (WhatsApp / Email / Push)", () => {
  it("starts not connected, inactive, with every message off and the default templates", async () => {
    const org = await makeOrg();
    const settings = await getChannelSettings(org.id, "whatsapp");
    expect(settings.providerConnected).toBe(false);
    expect(settings.active).toBe(false);
    expect(Object.values(settings.messages).every((on) => on === false)).toBe(true);
    expect(settings.templates.orderConfirmationCustomer).toBe(CHANNEL_CONFIG.whatsapp.templates[0].defaultBody);
  });

  it("can't be activated until the platform connects the provider, and disconnecting deactivates it", async () => {
    const org = await makeOrg();
    await expect(setChannelActive(org.id, "email", true)).rejects.toThrow(ChannelProviderNotConnectedError);

    await setChannelProviderConnected(org.id, "email", true);
    await setChannelActive(org.id, "email", true);
    expect((await getChannelSettings(org.id, "email")).active).toBe(true);

    await setChannelProviderConnected(org.id, "email", false);
    expect((await getChannelSettings(org.id, "email")).active).toBe(false);
  });

  it("push has no provider to connect, so it is always available", async () => {
    const org = await makeOrg();
    expect((await getChannelSettings(org.id, "push")).providerConnected).toBe(true);
  });

  it("saves message preferences, ignoring coming-soon messages, per channel and per tenant", async () => {
    const org = await makeOrg();
    const other = await makeOrg();
    await setChannelMessages(org.id, "whatsapp", { orderConfirmation: true, paymentConfirmation: true, orderStatusUpdates: true });
    const saved = await getChannelSettings(org.id, "whatsapp");
    expect(saved.messages).toMatchObject({ orderConfirmation: true, paymentConfirmation: true, orderStatusUpdates: false });
    expect((await getChannelSettings(org.id, "email")).messages.orderConfirmation).toBe(false);
    expect((await getChannelSettings(other.id, "whatsapp")).messages.orderConfirmation).toBe(false);
  });

  it("saves an edited template, falls back to the default if blank, and rejects unknown or empty ones", async () => {
    const org = await makeOrg();
    await setChannelTemplate(org.id, "whatsapp", "orderConfirmationCustomer", "Hi {{customer_name}}, thanks!");
    expect((await getChannelSettings(org.id, "whatsapp")).templates.orderConfirmationCustomer).toBe("Hi {{customer_name}}, thanks!");
    await expect(setChannelTemplate(org.id, "whatsapp", "nope", "x")).rejects.toThrow(InvalidChannelTemplateError);
    await expect(setChannelTemplate(org.id, "whatsapp", "orderConfirmationCustomer", "   ")).rejects.toThrow(InvalidChannelTemplateError);
  });
});
