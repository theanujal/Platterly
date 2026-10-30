import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

const sendEmail = vi.hoisted(() => vi.fn(async () => ({ status: "sent" as const })));
vi.mock("@/modules/messages/zeptomail", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/modules/messages/zeptomail")>()), sendEmail }));

import { notifySafely } from "../notifications";

const P = "staffmail";

async function clean() {
  await prisma.notification.deleteMany({ where: { OR: [{ productKey: P }, { kind: { startsWith: "ntest." } }] } });
  await prisma.product.deleteMany({ where: { key: P } });
}
beforeEach(async () => {
  await clean();
  sendEmail.mockClear();
  process.env.STAFF_NOTIFY_EMAILS = "hello@platterly.in";
  await prisma.product.create({ data: { key: P, name: "Staff mail", baseUrl: "http://127.0.0.1:1", outboundSecret: "x", inboundSecret: "x" } });
});
afterAll(async () => {
  delete process.env.STAFF_NOTIFY_EMAILS;
  await clean();
});

describe("staff emails", () => {
  it("emails staff for an INFO notification that asks for it, once per dedupe key", async () => {
    const input = { productKey: P, kind: "ntest.paid", title: "Payment received", body: "Premium: paid", emailStaff: true, dedupeKey: "ntest:paid:1" };
    await notifySafely(input);
    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledTimes(1));
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "hello@platterly.in", subject: "Platterly Ops: Payment received" }));

    await notifySafely(input);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("does not email staff for a plain INFO notification", async () => {
    await notifySafely({ productKey: P, kind: "ntest.quiet", title: "Quiet", body: "nothing to see" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("still emails staff for a warning", async () => {
    await notifySafely({ productKey: P, kind: "ntest.warn", severity: "WARNING", title: "A payment failed", body: "x" });
    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledTimes(1));
  });
});
