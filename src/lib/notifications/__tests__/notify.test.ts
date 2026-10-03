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
      event: "custom.no_template",
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

describe("notify() email gating (Chunk 16)", () => {
  it("does not send a templated email while the channel is off, but always sends invitations", async () => {
    const { vi } = await import("vitest");
    vi.stubEnv("ZEPTOMAIL_TOKEN", "abc");
    vi.stubEnv("ZEPTOMAIL_FROM", "noreply@platterly.test");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ request_id: "req-9" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const org = await makeOrg();
      const invoice = await notify({ organizationId: org.id, channel: "EMAIL", event: "invoice.sent", recipient: { email: "c@example.test" }, payload: { number: "INV-1" } });
      expect(invoice.logs[0].status).toBe("skipped");
      expect(fetchMock).not.toHaveBeenCalled();

      const invite = await notify({ organizationId: org.id, channel: "EMAIL", event: "team.invitation_sent", recipient: { email: "t@example.test" }, payload: { organizationName: "X", inviterName: "Y", acceptUrl: "https://x.test/a" } });
      expect(invite.logs[0].status).toBe("sent");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });
});
