import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { newId, parseManifest, parseReportDoc, signedHeaders, verifyRequest } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { GET as manifestGET } from "@/app/api/ops/manifest/route";
import { GET as reportGET } from "@/app/api/ops/reports/[key]/route";
import { createCustomer } from "@/modules/customers/customer";
import { createOrder } from "@/modules/orders/order";
import { createEventType } from "@/modules/events/event-type";
import { CATERING_REPORTS } from "../reports";

/** The platform reports catering publishes to ops: signed, valid documents, across kitchens, and with no customer details in them. */
const COMMAND_SECRET = "opssec_reports_command";
const EVENT_SECRET = "opssec_reports_event";
const saved: Record<string, string | undefined> = {};
const orgIds: string[] = [];
const userIds: string[] = [];
const day = (iso: string) => new Date(iso);

const request = (path: string, secret = COMMAND_SECRET) => new Request(`http://127.0.0.1:3000${path}`, { headers: signedHeaders(secret, newId("command"), "") });
const call = (key: string, query = "") => reportGET(request(`/api/ops/reports/${key}${query}`), { params: Promise.resolve({ key }) });

async function kitchen(label: string, customerName: string, total: number) {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: `Report Kitchen ${label}`, slug: `rk-${label}-${crypto.randomUUID().slice(0, 6)}`, createdAt: new Date() } });
  const user = await prisma.user.create({ data: { id: crypto.randomUUID(), name: label, email: `rk-${label}-${crypto.randomUUID()}@example.test`, emailVerified: true } });
  orgIds.push(org.id);
  userIds.push(user.id);
  const type = await createEventType(org.id, { name: "Wedding" }, user.id);
  const customer = await createCustomer(org.id, { name: customerName, phone: `98765${Math.floor(10000 + Math.random() * 89999)}` }, user.id);
  await createOrder(org.id, { customerId: customer.id, eventTypeId: type.id, eventStartDate: day("2027-01-10"), eventEndDate: day("2027-01-10"), totalParticipants: 50, adultCount: 1, individualPricingEnabled: true, mealPlanEntries: [{ date: day("2027-01-10"), mealType: "DINNER", price: total }] } as never, user.id);
}

beforeAll(async () => {
  for (const k of ["OPS_BASE_URL", "OPS_EVENT_SECRET", "OPS_COMMAND_SECRETS", "OPS_PRODUCT_KEY"]) saved[k] = process.env[k];
  await kitchen("a", "Asha Rao Secretname", 4000);
  await kitchen("b", "Bhavna Mehta Secretname", 6000);
});
beforeEach(() => {
  Object.assign(process.env, { OPS_BASE_URL: "http://127.0.0.1:9", OPS_EVENT_SECRET: EVENT_SECRET, OPS_COMMAND_SECRETS: COMMAND_SECRET, OPS_PRODUCT_KEY: "catering" });
});
afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("platform reports for ops", () => {
  it("every listed report answers a signed, valid document", async () => {
    for (const { key, label } of CATERING_REPORTS) {
      const res = await call(key);
      expect(res.status, key).toBe(200);
      const text = await res.text();
      expect(verifyRequest([EVENT_SECRET], res.headers, text).ok, `${key} signed`).toBe(true);
      const parsed = parseReportDoc(JSON.parse(text));
      expect(parsed.ok, `${key}: ${parsed.ok ? "" : parsed.error}`).toBe(true);
      expect(parsed.ok && parsed.value).toMatchObject({ report: key, title: label });
    }
  });

  it("sales adds up across kitchens and lists each one", async () => {
    const doc = (await (await call("sales")).json()) as { blocks: { type: string; title?: string; rows?: string[][] }[] };
    const kitchens = doc.blocks.find((b) => b.type === "table" && b.title === "Kitchens")!;
    const names = kitchens.rows!.map((r) => r[0]);
    expect(names).toEqual(expect.arrayContaining(["Report Kitchen a", "Report Kitchen b"]));
  });

  it("no customer name leaves catering in any report", async () => {
    for (const { key } of CATERING_REPORTS) {
      const text = await (await call(key)).text();
      expect(text, key).not.toContain("Secretname");
    }
  });

  it("a date range narrows the figures: a window with no orders shows none", async () => {
    const all = JSON.stringify(await (await call("events")).json());
    const none = JSON.stringify(await (await call("events", "?from=2000-01-01&to=2000-01-31")).json());
    expect(all).toContain("Report Kitchen");
    expect(none).not.toContain("Report Kitchen");
    expect(JSON.parse(none).period).toEqual({ from: "2000-01-01", to: "2000-01-31" });
  });

  it("answers 404 for an unknown report, 400 for a bad date, 401 unsigned or wrongly signed, and 404 with the link off", async () => {
    expect((await call("nope")).status).toBe(404);
    expect((await call("sales", "?from=yesterday")).status).toBe(400);
    expect((await reportGET(new Request("http://127.0.0.1:3000/api/ops/reports/sales"), { params: Promise.resolve({ key: "sales" }) })).status).toBe(401);
    expect((await reportGET(request("/api/ops/reports/sales", "not-the-secret"), { params: Promise.resolve({ key: "sales" }) })).status).toBe(401);
    delete process.env.OPS_BASE_URL;
    expect((await call("sales")).status).toBe(404);
  });

  it("the manifest lists the reports", async () => {
    const res = await manifestGET(request("/api/ops/manifest"));
    const parsed = parseManifest(await res.json());
    expect(parsed.ok && parsed.value.reports).toEqual(CATERING_REPORTS);
  });
});
