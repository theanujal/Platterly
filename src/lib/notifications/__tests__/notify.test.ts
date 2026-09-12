import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications/notify";

const cleanupOrgIds: string[] = [];

afterEach(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: cleanupOrgIds } } });
  cleanupOrgIds.length = 0;
});

async function makeOrg() {
  const org = await prisma.organization.create({
    data: { id: crypto.randomUUID(), name: "Notify Test Org", slug: `notify-${crypto.randomUUID()}`, createdAt: new Date() },
  });
  cleanupOrgIds.push(org.id);
  return org;
}

describe("notify() (Chunk 2 Group 2.1)", () => {
  it("writes a Notification with a log-only NotificationLog row", async () => {
    const org = await makeOrg();
    const result = await notify({
      organizationId: org.id,
      channel: "EMAIL",
      event: "quotation.sent",
      recipient: { email: "customer@example.test" },
      payload: { quotationId: "q_123" },
    });

    expect(result.organizationId).toBe(org.id);
    expect(result.logs).toHaveLength(1);
    expect(result.logs[0].status).toBe("logged");
  });

  it("also creates a WhatsAppMessage stub row for the WHATSAPP channel", async () => {
    const org = await makeOrg();
    const result = await notify({
      organizationId: org.id,
      channel: "WHATSAPP",
      event: "order.confirmed",
      recipient: { phone: "+919999999999" },
      payload: { orderId: "o_1" },
    });

    expect(result.whatsAppMessages).toHaveLength(1);
    expect(result.whatsAppMessages[0].toPhone).toBe("+919999999999");
    expect(result.whatsAppMessages[0].status).toBe("queued");
  });
});
