import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  ChannelProviderNotConnectedError,
  getChannelSettings,
  setChannelActive,
  setChannelMessages,
  setChannelProviderConnected,
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
  it("starts connected and active, with every kitchen WhatsApp message on", async () => {
    const org = await makeOrg();
    const settings = await getChannelSettings(org.id, "whatsapp");
    expect(settings.providerConnected).toBe(true);
    expect(settings.active).toBe(true);
    expect(Object.keys(settings.messages)).toEqual(CHANNEL_CONFIG.whatsapp.messages.map((m) => m.key));
    expect(Object.values(settings.messages).every((on) => on === true)).toBe(true);
  });

  it("WhatsApp is on for every kitchen by default; the kitchen can switch it off and on, and the platform can disconnect it", async () => {
    const org = await makeOrg();
    await setChannelActive(org.id, "whatsapp", false);
    expect((await getChannelSettings(org.id, "whatsapp")).active).toBe(false);
    await setChannelActive(org.id, "whatsapp", true);
    expect((await getChannelSettings(org.id, "whatsapp")).active).toBe(true);

    await setChannelProviderConnected(org.id, "whatsapp", false);
    const off = await getChannelSettings(org.id, "whatsapp");
    expect(off.providerConnected).toBe(false);
    expect(off.active).toBe(false);
    await expect(setChannelActive(org.id, "whatsapp", true)).rejects.toThrow(ChannelProviderNotConnectedError);
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

  it("a WhatsApp message switched off stays off, and the master switch turns all of them off or on", async () => {
    const org = await makeOrg();
    await setChannelMessages(org.id, "whatsapp", { waPaymentReceived: false });
    const saved = await getChannelSettings(org.id, "whatsapp");
    expect(saved.messages.waPaymentReceived).toBe(false);
    expect(saved.messages.waNewOrder).toBe(true);
    await setChannelActive(org.id, "whatsapp", false);
    expect(Object.values((await getChannelSettings(org.id, "whatsapp")).messages).every((on) => on === false)).toBe(true);
    await setChannelActive(org.id, "whatsapp", true);
    expect(Object.values((await getChannelSettings(org.id, "whatsapp")).messages).every((on) => on === true)).toBe(true);
  });

  it("push has no provider to connect, so it is always available", async () => {
    const org = await makeOrg();
    expect((await getChannelSettings(org.id, "push")).providerConnected).toBe(true);
  });

  it("saves message preferences, ignoring coming-soon messages, per channel and per tenant", async () => {
    const org = await makeOrg();
    const other = await makeOrg();
    await setChannelMessages(org.id, "push", { orderConfirmation: true, eventReminders: true, orderStatusUpdates: true });
    const saved = await getChannelSettings(org.id, "push");
    expect(saved.messages).toMatchObject({ orderConfirmation: true, eventReminders: true, orderStatusUpdates: false });
    // Email is the other way round: every kitchen -> customer message starts on.
    expect((await getChannelSettings(org.id, "email")).messages.orderReceived).toBe(true);
    expect((await getChannelSettings(other.id, "push")).messages.orderConfirmation).toBe(false);
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

});
