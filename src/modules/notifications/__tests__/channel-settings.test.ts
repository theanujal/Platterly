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

  it("WhatsApp can't be activated until the platform connects it, and disconnecting deactivates it", async () => {
    const org = await makeOrg();
    await expect(setChannelActive(org.id, "whatsapp", true)).rejects.toThrow(ChannelProviderNotConnectedError);

    await setChannelProviderConnected(org.id, "whatsapp", true);
    await setChannelActive(org.id, "whatsapp", true);
    expect((await getChannelSettings(org.id, "whatsapp")).active).toBe(true);

    await setChannelProviderConnected(org.id, "whatsapp", false);
    expect((await getChannelSettings(org.id, "whatsapp")).active).toBe(false);
  });

  it("Email is connected for every kitchen by default; the platform can still switch it off", async () => {
    const org = await makeOrg();
    expect((await getChannelSettings(org.id, "email")).providerConnected).toBe(true);
    await setChannelActive(org.id, "email", true);
    expect((await getChannelSettings(org.id, "email")).active).toBe(true);

    await setChannelProviderConnected(org.id, "email", false);
    const off = await getChannelSettings(org.id, "email");
    expect(off.providerConnected).toBe(false);
    expect(off.active).toBe(false);
    await expect(setChannelActive(org.id, "email", true)).rejects.toThrow(ChannelProviderNotConnectedError);
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
    // Email is the other way round: every kitchen -> customer message starts on.
    expect((await getChannelSettings(org.id, "email")).messages.orderReceived).toBe(true);
    expect((await getChannelSettings(other.id, "whatsapp")).messages.orderConfirmation).toBe(false);
  });

  it("email starts active with every customer message on, and a switched-off message stays off", async () => {
    const org = await makeOrg();
    const fresh = await getChannelSettings(org.id, "email");
    expect(fresh.active).toBe(true);
    expect(Object.values(fresh.messages).every((on) => on === true)).toBe(true);
    expect(Object.keys(fresh.messages)).toEqual(CHANNEL_CONFIG.email.messages.map((m) => m.key));
    await setChannelMessages(org.id, "email", { foodDispatched: false });
    const saved = await getChannelSettings(org.id, "email");
    expect(saved.messages.foodDispatched).toBe(false);
    expect(saved.messages.orderConfirmed).toBe(true);
  });

  it("deactivating email turns every customer message off, and activating turns them all back on for the kitchen to choose from", async () => {
    const org = await makeOrg();
    await setChannelMessages(org.id, "email", { quotation: false });
    await setChannelActive(org.id, "email", false);
    const off = await getChannelSettings(org.id, "email");
    expect(off.active).toBe(false);
    expect(Object.values(off.messages).every((on) => on === false)).toBe(true);
    await setChannelActive(org.id, "email", true);
    const on = await getChannelSettings(org.id, "email");
    expect(on.active).toBe(true);
    expect(Object.values(on.messages).every((v) => v === true)).toBe(true);
    await setChannelMessages(org.id, "email", { quotation: false });
    expect((await getChannelSettings(org.id, "email")).messages.quotation).toBe(false);
  });

  it("saves an edited template, falls back to the default if blank, and rejects unknown or empty ones", async () => {
    const org = await makeOrg();
    await setChannelTemplate(org.id, "whatsapp", "orderConfirmationCustomer", "Hi {{customer_name}}, thanks!");
    expect((await getChannelSettings(org.id, "whatsapp")).templates.orderConfirmationCustomer).toBe("Hi {{customer_name}}, thanks!");
    await expect(setChannelTemplate(org.id, "whatsapp", "nope", "x")).rejects.toThrow(InvalidChannelTemplateError);
    await expect(setChannelTemplate(org.id, "whatsapp", "orderConfirmationCustomer", "   ")).rejects.toThrow(InvalidChannelTemplateError);
  });
});
