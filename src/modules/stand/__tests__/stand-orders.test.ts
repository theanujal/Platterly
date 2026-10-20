import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { newId, signedHeaders, verifyRequest } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { ValidationError } from "@/lib/errors";
import { getStandInvoice, getStandPageData, hasPrintedStands, startStandOrder, standLinkUrl, verifyStandOrder } from "../stand-orders";

/**
 * The Order QR stand, catering's side: it asks Platterly Ops over the signed billing API. Ops is a small signed stand-in server,
 * so the signature, path and body of every request are checked. Needs the ops link, not the OPS_BILLING flag.
 */
const EVENT_SECRET = "opssec_stand_event";
const COMMAND_SECRET = "opssec_stand_command";
const saved: Record<string, string | undefined> = {};
const orgIds: string[] = [];

let server: Server;
let baseUrl = "";
let requests: { method: string; path: string; body: string; headers: Record<string, string | string[] | undefined> }[] = [];
let answers: Record<string, { status: number; body: unknown }> = {};

const shipTo = { name: "Asha Rao", phone: "+919876543210", addressLine1: "1 Main Rd", addressLine2: null, city: "Bengaluru", state: "Karnataka", postalCode: "560001", country: "India" };
const offer = { available: true, unitAmount: 500, gstPercent: 18, unitGst: 90, unitTotal: 590, maxPerOrder: 3 };

beforeAll(async () => {
  for (const k of ["OPS_BASE_URL", "OPS_EVENT_SECRET", "OPS_COMMAND_SECRETS", "OPS_PRODUCT_KEY", "OPS_BILLING", "NEXT_PUBLIC_APP_URL"]) saved[k] = process.env[k];
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      requests.push({ method: req.method!, path: req.url!, body, headers: req.headers });
      const key = Object.keys(answers).find((k) => `${req.method} ${req.url}`.startsWith(k));
      const answer = key ? answers[key] : { status: 500, body: { error: "unexpected" } };
      const text = JSON.stringify(answer.body);
      res.writeHead(answer.status, signedHeaders(COMMAND_SECRET, newId("command"), text));
      res.end(text);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await new Promise<void>((r) => server.close(() => r()));
});
beforeEach(() => {
  requests = [];
  answers = {};
  process.env.OPS_BASE_URL = baseUrl;
  process.env.OPS_EVENT_SECRET = EVENT_SECRET;
  process.env.OPS_COMMAND_SECRETS = COMMAND_SECRET;
  process.env.OPS_PRODUCT_KEY = "catering";
  delete process.env.OPS_BILLING; // the stand needs the link only
});
afterEach(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  orgIds.length = 0;
});

async function makeKitchen(over: { claimed?: boolean; status?: "ACTIVE" | "SUSPENDED"; logo?: string | null } = {}) {
  const org = await prisma.organization.create({
    data: {
      id: crypto.randomUUID(),
      name: "Spice Route",
      slug: `stand-${crypto.randomUUID().slice(0, 8)}`,
      slugChangeCount: over.claimed === false ? 0 : 1,
      status: over.status ?? "ACTIVE",
      logo: over.logo === undefined ? "/uploads/logo.webp" : over.logo,
      ownerFirstName: "Asha",
      ownerLastName: "Rao",
      contactPhone: "+919876543210",
      addressLine1: "1 Main Rd",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      country: "India",
      gstNumber: "29ABCDE1234F1Z5",
      createdAt: new Date(),
    },
  });
  orgIds.push(org.id);
  return org;
}

describe("the page's data", () => {
  it("reads the offer and this kitchen's orders from ops, signed, and pre-fills the business address", async () => {
    const org = await makeKitchen();
    answers = {
      [`GET /api/products/catering/stand/offer`]: { status: 200, body: offer },
      [`GET /api/products/catering/businesses/${org.businessId}/stand/orders`]: { status: 200, body: { orders: [{ id: "stand_1", quantity: 2, total: 1180, fulfilment: "PLACED", paymentStatus: "PAID" }] } },
    };
    const data = await getStandPageData(org.id);
    expect(data).toMatchObject({ unavailable: false, offer: { unitTotal: 590 }, kitchenName: "Spice Route", shipTo: { name: "Asha Rao", city: "Bengaluru", postalCode: "560001", phone: "+919876543210" } });
    expect(data.orders).toHaveLength(1);
    expect(data.linkUrl).toContain(`/${org.slug}`);
    for (const r of requests) expect(verifyRequest([EVENT_SECRET], new Headers(r.headers as Record<string, string>), r.body, { target: { method: r.method, path: r.path } }).ok).toBe(true);
  });

  it("says unavailable when the ops link is not set up or ops cannot be reached, and never throws", async () => {
    const org = await makeKitchen();
    delete process.env.OPS_BASE_URL;
    expect(await getStandPageData(org.id)).toMatchObject({ unavailable: true, offer: null, orders: [] });
    process.env.OPS_BASE_URL = baseUrl; // answers are empty: ops answers 500
    expect(await getStandPageData(org.id)).toMatchObject({ unavailable: true });
  });

  it("has no direct link until the kitchen claims one, or while it is suspended", async () => {
    expect(await standLinkUrl((await makeKitchen({ claimed: false })).id)).toBeNull();
    expect(await standLinkUrl((await makeKitchen({ status: "SUSPENDED" })).id)).toBeNull();
  });
});

describe("ordering", () => {
  it("sends the quantity, the address, the buyer and the print details (the direct link, no redirect), and returns Razorpay's order", async () => {
    const org = await makeKitchen();
    answers = { [`POST /api/products/catering/businesses/${org.businessId}/stand/orders`]: { status: 200, body: { keyId: "rzp_x", razorpayOrderId: "order_1", amountPaise: 118000, businessName: "Spice Route", description: "Order QR stand x 2", orderId: "stand_1" } } };
    const answer = await startStandOrder(org.id, 2, shipTo);
    expect(answer).toMatchObject({ razorpayOrderId: "order_1", amountPaise: 118000, orderId: "stand_1" });
    const sent = JSON.parse(requests[0].body);
    expect(sent).toMatchObject({ quantity: 2, kitchenName: "Spice Route", shipTo: { city: "Bengaluru" }, buyer: { name: "Spice Route", gstin: "29ABCDE1234F1Z5" } });
    expect(sent.linkUrl).toBe(`${new URL(sent.linkUrl).origin}/${org.slug}`);
    expect(sent.linkUrl).not.toContain("?"); // exactly the public link: no ?src tag in the printed QR
    expect(sent.kitchenLogoUrl).toMatch(/^https?:\/\/.+\/uploads\/logo\.webp$/);
  });

  it("refuses 0 or 4 stands, a bad address, and a kitchen with no link yet, before calling ops", async () => {
    const org = await makeKitchen();
    await expect(startStandOrder(org.id, 4, shipTo)).rejects.toThrow(ValidationError);
    await expect(startStandOrder(org.id, 0, shipTo)).rejects.toThrow(/1 to 3/);
    await expect(startStandOrder(org.id, 1, { ...shipTo, postalCode: "" })).rejects.toThrow(/PIN code/);
    await expect(startStandOrder((await makeKitchen({ claimed: false })).id, 1, shipTo)).rejects.toThrow(/Platterly link first/);
    expect(requests).toHaveLength(0);
  });

  it("shows ops's own plain message when ops refuses (for example not on sale)", async () => {
    const org = await makeKitchen();
    answers = { [`POST /api/products/catering/businesses/${org.businessId}/stand/orders`]: { status: 400, body: { error: "The Order QR stand is not on sale yet. Please contact Platterly." } } };
    await expect(startStandOrder(org.id, 1, shipTo)).rejects.toThrow(/not on sale yet/);
  });

  it("verifies a Razorpay payment through ops", async () => {
    const org = await makeKitchen();
    answers = { [`POST /api/products/catering/businesses/${org.businessId}/stand/orders/verify`]: { status: 200, body: { ok: true, orderId: "stand_1" } } };
    await verifyStandOrder(org.id, { razorpayOrderId: "order_1", razorpayPaymentId: "pay_1", signature: "a".repeat(64) });
    expect(JSON.parse(requests[0].body)).toEqual({ razorpayOrderId: "order_1", razorpayPaymentId: "pay_1", signature: "a".repeat(64) });
  });
});

describe("the invoice and the link-change warning", () => {
  it("returns the frozen invoice, or null for an order that is not this kitchen's", async () => {
    const org = await makeKitchen();
    answers = { [`GET /api/products/catering/businesses/${org.businessId}/stand/orders/stand_1/invoice`]: { status: 200, body: { orderId: "stand_1", invoiceNumber: "FPSR-26-10-1", total: 1180 } }, [`GET /api/products/catering/businesses/${org.businessId}/stand/orders/stand_9/invoice`]: { status: 404, body: { error: "unknown_invoice" } } };
    expect(await getStandInvoice(org.id, "stand_1")).toMatchObject({ invoiceNumber: "FPSR-26-10-1" });
    expect(await getStandInvoice(org.id, "stand_9")).toBeNull();
  });

  it("knows whether printed stands exist, and says no when ops cannot be reached", async () => {
    const org = await makeKitchen();
    answers = { [`GET /api/products/catering/businesses/${org.businessId}/stand/orders`]: { status: 200, body: { orders: [{ id: "stand_1" }] } } };
    expect(await hasPrintedStands(org.id)).toBe(true);
    answers = { [`GET /api/products/catering/businesses/${org.businessId}/stand/orders`]: { status: 200, body: { orders: [] } } };
    expect(await hasPrintedStands(org.id)).toBe(false);
    answers = {};
    expect(await hasPrintedStands(org.id)).toBe(false);
  });
});
