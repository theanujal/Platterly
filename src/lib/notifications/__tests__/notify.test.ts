import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications/notify";
import { setChannelActive, setChannelMessages } from "@/modules/notifications/channel-settings";

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
  it("does not send a customer email while the channel is off or its switch is off, but always sends invitations and team alerts", async () => {
    const { vi } = await import("vitest");
    vi.stubEnv("ZEPTOMAIL_TOKEN", "abc");
    vi.stubEnv("ZEPTOMAIL_FROM", "noreply@platterly.test");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ request_id: "req-9" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const org = await makeOrg();
      // On by default: a kitchen -> customer email goes out until the kitchen switches it off.
      const sentByDefault = await notify({ organizationId: org.id, channel: "EMAIL", event: "invoice.sent", recipient: { email: "c@example.test" }, payload: { number: "INV-1" } });
      expect(sentByDefault.logs[0].status).toBe("sent");
      fetchMock.mockClear();

      await setChannelMessages(org.id, "email", { invoice: false });
      const invoice = await notify({ organizationId: org.id, channel: "EMAIL", event: "invoice.sent", recipient: { email: "c@example.test" }, payload: { number: "INV-1" } });
      expect(invoice.logs[0].status).toBe("skipped");
      expect(fetchMock).not.toHaveBeenCalled();

      // Order status emails follow the switch for that status.
      await setChannelMessages(org.id, "email", { orderCompleted: false });
      const completed = await notify({ organizationId: org.id, channel: "EMAIL", event: "order.status_changed", recipient: { email: "c@example.test" }, payload: { status: "COMPLETED" } });
      expect(completed.logs[0].status).toBe("skipped");
      const confirmed = await notify({ organizationId: org.id, channel: "EMAIL", event: "order.status_changed", recipient: { email: "c@example.test" }, payload: { status: "APPROVED" } });
      expect(confirmed.logs[0].status).toBe("sent");
      fetchMock.mockClear();

      // The team's own alerts ignore the kitchen's switches, even with the whole channel off.
      await setChannelActive(org.id, "email", false);
      const alert = await notify({ organizationId: org.id, channel: "EMAIL", event: "order.new_alert", recipient: { email: "team@example.test" }, payload: { customerName: "Asha" } });
      expect(alert.logs[0].status).toBe("sent");
      const lead = await notify({ organizationId: org.id, channel: "EMAIL", event: "lead.new", recipient: { email: "team@example.test" }, payload: { customerName: "Asha" } });
      expect(lead.logs[0].status).toBe("sent");
      fetchMock.mockClear();

      const invite = await notify({ organizationId: org.id, channel: "EMAIL", event: "team.invitation_sent", recipient: { email: "t@example.test" }, payload: { organizationName: "X", inviterName: "Y", acceptUrl: "https://x.test/a" } });
      expect(invite.logs[0].status).toBe("sent");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });
});
