import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createEnquiry, EnquiryError, listEnquiries, parseEnquiry, updateEnquiry } from "../enquiries";
import { OPTIONS, POST } from "@/app/api/public/enquiries/route";

const MARK = `enq-test-${Math.random().toString(36).slice(2, 8)}`;
const talk = { kind: "talk", name: "Asha Rao", email: `${MARK}@example.test`, phone: "+91 98765 43210", businessType: "Wedding caterer", message: "We cater 40 events a month.", page: "/talk-to-us/", source: "platterly.in" };
const savedEnv = process.env.SITE_ORIGINS;
let ipCounter = 0;

function post(body: unknown, origin: string | null = "https://platterly.in", ip?: string) {
  return POST(new Request("https://ops.platterly.in/api/public/enquiries", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": ip ?? `10.9.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`, ...(origin ? { Origin: origin } : {}) }, body: typeof body === "string" ? body : JSON.stringify(body) }));
}

async function clean() {
  await prisma.notification.deleteMany({ where: { kind: "lead.new", body: { contains: "Asha Rao" } } });
  await prisma.enquiry.deleteMany({ where: { email: { contains: MARK } } });
}
beforeAll(() => {
  process.env.SITE_ORIGINS = "https://platterly.in,http://localhost:3100";
});
afterAll(async () => {
  await clean();
  if (savedEnv === undefined) delete process.env.SITE_ORIGINS;
  else process.env.SITE_ORIGINS = savedEnv;
});
afterEach(clean);

describe("validation", () => {
  it("accepts a Book a demo request and a Contact request, and trims text", () => {
    expect(parseEnquiry({ ...talk, name: "  Asha Rao  " })).toMatchObject({ kind: "talk", name: "Asha Rao", phone: "+91 98765 43210", businessType: "Wedding caterer" });
    expect(parseEnquiry({ kind: "contact", name: "Ravi", email: "r@example.test", subject: "Billing or an invoice", message: "Please resend my last invoice." })).toMatchObject({ kind: "contact", phone: null });
  });

  it("refuses what the site's own form would refuse", () => {
    const bad = (over: Record<string, unknown>) => () => parseEnquiry({ ...talk, ...over });
    expect(bad({ name: "A" })).toThrow(EnquiryError);
    expect(bad({ email: "nope" })).toThrow(/valid email/);
    expect(bad({ phone: "" })).toThrow(/phone/); // a demo request needs a phone
    expect(bad({ phone: "abc" })).toThrow(/valid phone/);
    expect(bad({ businessType: "" })).toThrow(/kind of business/);
    expect(bad({ kind: "spam" })).toThrow(/Unknown form/);
    expect(() => parseEnquiry("text")).toThrow(EnquiryError);
    expect(() => parseEnquiry({ kind: "contact", name: "Ravi", email: "r@example.test", subject: "x", message: "short" })).toThrow(/little more/);
  });
});

describe("the public endpoint", () => {
  it("stores the lead, tells staff once, and answers with CORS for the site's own origin only", async () => {
    const response = await post(talk);
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://platterly.in");
    const { id } = await response.json();
    const row = await prisma.enquiry.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ kind: "talk", name: "Asha Rao", status: "NEW", page: "/talk-to-us/" });
    const notices = await prisma.notification.findMany({ where: { kind: "lead.new", dedupeKey: `lead:${id}` } });
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ severity: "WARNING", link: "/enquiries" });
  });

  it("refuses another website's browser, answers the preflight, and a request with no Origin (a server or curl) still works", async () => {
    expect((await post(talk, "https://evil.example")).status).toBe(403);
    expect(await prisma.enquiry.count({ where: { email: { contains: MARK } } })).toBe(0);
    const preflight = await OPTIONS(new Request("https://ops.platterly.in/api/public/enquiries", { method: "OPTIONS", headers: { Origin: "http://localhost:3100" } }));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3100");
    expect(preflight.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect((await OPTIONS(new Request("https://ops.platterly.in/x", { method: "OPTIONS", headers: { Origin: "https://evil.example" } }))).headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect((await post(talk, null)).status).toBe(200);
  });

  it("answers a robot (the hidden field filled) with 200 and stores nothing; bad JSON and bad fields are 400", async () => {
    expect((await post({ ...talk, website: "http://spam.example" })).status).toBe(200);
    expect(await prisma.enquiry.count({ where: { email: { contains: MARK } } })).toBe(0);
    expect((await post("{not json")).status).toBe(400);
    const bad = await post({ ...talk, email: "nope" });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toMatch(/valid email/);
  });

  it("allows 10 an hour from one address, then 429", async () => {
    const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
    for (let i = 0; i < 10; i++) expect((await post({ ...talk, email: `${MARK}-${i}@example.test` }, "https://platterly.in", ip)).status).toBe(200);
    expect((await post({ ...talk, email: `${MARK}-x@example.test` }, "https://platterly.in", ip)).status).toBe(429);
    expect((await post({ ...talk, email: `${MARK}-y@example.test` }, "https://platterly.in", `${ip}9`)).status).toBe(200); // another address is not limited
  });
});

describe("following up", () => {
  it("staff move a lead New, Contacted, Closed with a note; the contacted time is kept and a lead can be reopened", async () => {
    const lead = await createEnquiry(parseEnquiry(talk));
    const contacted = await updateEnquiry(lead.id, { status: "CONTACTED", note: "Called, demo on Friday" }, null);
    expect(contacted).toMatchObject({ status: "CONTACTED", note: "Called, demo on Friday" });
    expect(contacted.contactedAt).not.toBeNull();
    const closed = await updateEnquiry(lead.id, { status: "CLOSED", note: null }, null);
    expect(closed.contactedAt?.getTime()).toBe(contacted.contactedAt?.getTime());
    expect((await updateEnquiry(lead.id, { status: "NEW", note: null }, null)).contactedAt).toBeNull();
    expect((await listEnquiries({ status: "NEW" })).some((r) => r.id === lead.id)).toBe(true);
    expect((await listEnquiries({ status: "CLOSED" })).some((r) => r.id === lead.id)).toBe(false);
    await expect(updateEnquiry("nope", { status: "NEW", note: null }, null)).rejects.toThrow(EnquiryError);
  });
});
