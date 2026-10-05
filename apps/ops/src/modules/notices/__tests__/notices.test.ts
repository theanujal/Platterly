import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { newId, signedHeaders } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { registerProduct } from "@/modules/registry/products";
import { NoticeError, cleanNotice, noticeDelivery, publishNotice, syncNotices } from "../notices";

const KEY = "noticetest";
const ids = [1, 2, 3].map((n) => `biz_${String(n).repeat(32)}`);
const input = { enabled: true, title: "Diwali offer", message: "20% off yearly plans.", buttonLabel: "See plans", buttonUrl: "/subscribe" };
let server: Server;
let baseUrl = "";
let inboundSecret = "";
let received: { type: string; businessId: string; payload: Record<string, unknown> }[] = [];
let status = 200;

async function clean() {
  await prisma.business.deleteMany({ where: { id: { in: ids } } });
  await prisma.product.deleteMany({ where: { key: KEY } });
}
async function addBusiness(id: string, over: { status?: "ACTIVE" | "PENDING_DELETE" } = {}) {
  await prisma.business.create({ data: { id, name: `Notice ${id.slice(4, 6)}`, status: over.status ?? "ACTIVE" } });
  await prisma.businessProduct.create({ data: { businessId: id, productKey: KEY } });
}

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const command = JSON.parse(body);
      received.push({ type: command.type, businessId: command.businessId, payload: command.payload });
      const reply = JSON.stringify(status === 200 ? { ok: true } : { ok: false, error: "refused" });
      res.writeHead(status, signedHeaders(inboundSecret, newId("command"), reply));
      res.end(reply);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await clean();
  await new Promise<void>((r) => server.close(() => r()));
});
beforeEach(async () => {
  await clean();
  received = [];
  status = 200;
  inboundSecret = (await registerProduct({ key: KEY, name: "Notice Test", baseUrl, actorUserId: null })).secrets.inbound;
});
afterEach(clean);

describe("cleanNotice", () => {
  it("trims, turns blanks into null, and keeps a valid button", () => {
    expect(cleanNotice({ ...input, title: "  Hi  ", buttonLabel: "", buttonUrl: "" })).toEqual({ enabled: true, title: "Hi", message: "20% off yearly plans.", buttonLabel: null, buttonUrl: null });
  });
  it("refuses an empty box that is on, half a button, text over the limits and an unsafe link", () => {
    expect(() => cleanNotice({ ...input, title: "", message: "" })).toThrow(NoticeError);
    expect(() => cleanNotice({ ...input, buttonUrl: "" })).toThrow(NoticeError);
    expect(() => cleanNotice({ ...input, buttonLabel: "" })).toThrow(NoticeError);
    expect(() => cleanNotice({ ...input, message: "x".repeat(241) })).toThrow(/at most 240/);
    for (const url of ["javascript:alert(1)", "http://example.com", "//evil.example", "data:text/html,x"]) expect(() => cleanNotice({ ...input, buttonUrl: url }), url).toThrow(NoticeError);
    expect(() => cleanNotice({ enabled: false, title: "", message: "", buttonLabel: "", buttonUrl: "" })).not.toThrow();
  });
});

describe("publishNotice", () => {
  it("sends notice.set to every business of the product, except one that is pending deletion", async () => {
    await addBusiness(ids[0]);
    await addBusiness(ids[1]);
    await addBusiness(ids[2], { status: "PENDING_DELETE" });
    const result = await publishNotice(KEY, input, null);
    expect(result).toEqual({ businesses: 3, queued: 2 });
    expect(received.map((r) => r.businessId).sort()).toEqual([ids[0], ids[1]]);
    expect(received[0]).toMatchObject({ type: "notice.set", payload: { enabled: true, title: "Diwali offer", buttonUrl: "/subscribe" } });
    expect(await noticeDelivery(KEY)).toEqual({ sent: 2, pending: 0, failed: 0 });
    expect(await prisma.auditLog.findFirst({ where: { action: "notice.published", subject: KEY } })).not.toBeNull();
  });

  it("the scheduled catch-up queues nothing twice, but reaches a business that joined later", async () => {
    await addBusiness(ids[0]);
    await publishNotice(KEY, input, null);
    expect(await syncNotices(KEY)).toBe(0);
    await addBusiness(ids[1]);
    expect(await syncNotices(KEY)).toBe(1);
    expect(await prisma.outboundCommand.count({ where: { productKey: KEY, type: "notice.set" } })).toBe(2);
  });

  it("a new save sends again (a new version), and switching off sends an off notice", async () => {
    await addBusiness(ids[0]);
    await publishNotice(KEY, input, null);
    await publishNotice(KEY, { ...input, enabled: false }, null);
    expect(received).toHaveLength(2);
    expect(received[1].payload).toMatchObject({ enabled: false });
    expect(await noticeDelivery(KEY)).toEqual({ sent: 1, pending: 0, failed: 0 });
  });

  it("reports a refusal by a product as failed delivery, and refuses a bad notice or unknown product before sending anything", async () => {
    await addBusiness(ids[0]);
    status = 400;
    await publishNotice(KEY, input, null);
    expect(await noticeDelivery(KEY)).toEqual({ sent: 0, pending: 0, failed: 1 });
    await expect(publishNotice(KEY, { ...input, buttonUrl: "javascript:x" }, null)).rejects.toThrow(NoticeError);
    await expect(publishNotice("nope", input, null)).rejects.toThrow(/Unknown product/);
    expect(received).toHaveLength(1);
  });
});
