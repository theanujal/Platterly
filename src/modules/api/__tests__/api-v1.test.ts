import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createApiKey, revokeApiKey, authenticateApiKey, listApiKeys } from "../keys";
import { API_SCOPES } from "../scopes";
import { GET as getKitchen } from "@/app/api/v1/kitchen/route";
import { GET as listMenus } from "@/app/api/v1/menus/route";
import { GET as getMenu } from "@/app/api/v1/menus/[id]/route";
import { GET as listMenuItems } from "@/app/api/v1/menu-items/route";
import { GET as getMenuItem } from "@/app/api/v1/menu-items/[id]/route";
import { GET as listAddOns } from "@/app/api/v1/addons/route";
import { GET as getAddOn } from "@/app/api/v1/addons/[id]/route";
import { GET as listCustomers, POST as postCustomer } from "@/app/api/v1/customers/route";
import { GET as getCustomer, PATCH as patchCustomer } from "@/app/api/v1/customers/[id]/route";
import { GET as listEvents } from "@/app/api/v1/events/route";
import { GET as getEvent } from "@/app/api/v1/events/[id]/route";
import { GET as getEventMealPlans } from "@/app/api/v1/events/[id]/meal-plans/route";
import { GET as getMealPlan } from "@/app/api/v1/meal-plans/[id]/route";
import { GET as listOrders, POST as postOrder } from "@/app/api/v1/orders/route";
import { GET as getOrder, PATCH as patchOrder } from "@/app/api/v1/orders/[id]/route";

/**
 * Chunk 25 — the public API end to end, at the route handlers, against the real database. Two kitchens, A and B, each
 * with one of everything. Covers authentication, revocation, scopes, a locked kitchen, validation, pagination,
 * idempotency, rate limiting, and (the release blocker) every resource asked for with the other kitchen's id.
 */
type Handler = (request: Request, route: { params: Promise<never> }) => Promise<Response>;
const orgIds: string[] = [];
const userIds: string[] = [];

interface Kitchen {
  orgId: string;
  userId: string;
  key: string; // every scope
  readKey: string; // reads only
  ids: { customer: string; eventType: string; menu: string; menuItem: string; addOn: string; order: string; event: string; mealPlan: string };
}
let A: Kitchen;
let B: Kitchen;

const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

// The responses are checked field by field below, so the body is read loosely here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;
interface ApiBody {
  data?: Loose;
  meta?: Loose;
  error?: { code: string; message: string; details?: unknown };
}

async function call(handler: unknown, path: string, opts: { method?: string; key?: string | null; body?: unknown; headers?: Record<string, string>; id?: string } = {}) {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.key !== null && opts.key !== undefined) headers.authorization = `Bearer ${opts.key}`;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const request = new Request(`http://catering.localhost:3000${path}`, { method: opts.method ?? "GET", headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  const response = await (handler as Handler)(request, { params: Promise.resolve({ id: opts.id } as never) });
  return { status: response.status, headers: response.headers, body: (await response.json()) as ApiBody };
}

async function kitchen(label: string): Promise<Kitchen> {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: `Api ${label}`, slug: `api-${label}-${crypto.randomUUID().slice(0, 6)}`, status: "ACTIVE", createdAt: new Date() } });
  orgIds.push(org.id);
  const user = await prisma.user.create({ data: { id: crypto.randomUUID(), name: label, email: `${label}-${crypto.randomUUID()}@example.test`, emailVerified: true } });
  userIds.push(user.id);
  const customer = await prisma.customer.create({ data: { organizationId: org.id, name: `${label} Customer`, phone: `+9198${Math.floor(10000000 + Math.random() * 89999999)}`, email: `${label}@c.test` } });
  const eventType = await prisma.eventType.create({ data: { organizationId: org.id, name: "Wedding" } });
  const menuItem = await prisma.menuItem.create({ data: { organizationId: org.id, name: `${label} Paneer`, foodType: "VEGETARIAN", price: 150 } });
  const menu = await prisma.menu.create({ data: { organizationId: org.id, name: `${label} Menu`, menuType: "VEGETARIAN", pricePerPlate: 400 } });
  const addOn = await prisma.addOn.create({ data: { organizationId: org.id, name: `${label} Chaat`, type: "LIVE_COUNTER", priceType: "FIXED", price: 2000 } });
  const day = new Date(`${future(20)}T00:00:00.000Z`);
  const order = await prisma.order.create({ data: { organizationId: org.id, customerId: customer.id, eventTypeId: eventType.id, orderNumber: `${label}-1`, eventStartDate: day, eventEndDate: day, adultCount: 50, totalParticipants: 50, total: 20000, balance: 20000, notes: "visible note", kitchenNotes: "SECRET kitchen note" } });
  const event = await prisma.event.create({ data: { organizationId: org.id, customerId: customer.id, eventTypeId: eventType.id, name: `${label} Event`, startDate: day, endDate: day, orderId: order.id, notes: "internal event note" } });
  const mealPlan = await prisma.mealPlanEntry.create({ data: { orderId: order.id, date: day, mealType: "DINNER", menuId: menu.id, price: 400 } });
  const all = await createApiKey(org.id, { name: "All", scopes: API_SCOPES.map((s) => s.id) }, user.id);
  const read = await createApiKey(org.id, { name: "Read", scopes: ["menus:read", "customers:read", "events:read", "meal-plans:read", "orders:read", "addons:read"] }, user.id);
  return { orgId: org.id, userId: user.id, key: all.key, readKey: read.key, ids: { customer: customer.id, eventType: eventType.id, menu: menu.id, menuItem: menuItem.id, addOn: addOn.id, order: order.id, event: event.id, mealPlan: mealPlan.id } };
}

beforeAll(async () => {
  A = await kitchen("a");
  B = await kitchen("b");
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("API keys", () => {
  it("shows the key once, stores only a hash, and lists only the prefix", async () => {
    const created = await createApiKey(A.orgId, { name: "Listing test", scopes: ["menus:read"] }, A.userId);
    expect(created.key).toMatch(/^plt_live_[a-f0-9]{12}_[A-Za-z0-9_-]{43}$/);
    const row = await prisma.apiKey.findUniqueOrThrow({ where: { id: created.apiKey.id } });
    expect(row.keyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(row)).not.toContain(created.key);
    const listed = JSON.stringify(await listApiKeys(A.orgId));
    expect(listed).toContain(created.apiKey.prefix);
    expect(listed).not.toContain(created.key);
    expect(listed).not.toContain("keyHash");
  });

  it("needs a name and at least one known permission, and ignores unknown permissions", async () => {
    await expect(createApiKey(A.orgId, { name: "  ", scopes: ["menus:read"] }, A.userId)).rejects.toThrow();
    await expect(createApiKey(A.orgId, { name: "x", scopes: [] }, A.userId)).rejects.toThrow(/permission/);
    await expect(createApiKey(A.orgId, { name: "x", scopes: ["admin:everything"] }, A.userId)).rejects.toThrow(/permission/);
    const k = await createApiKey(A.orgId, { name: "mixed", scopes: ["menus:read", "admin:everything", "menus:read"] }, A.userId);
    expect(k.apiKey.scopes).toEqual(["menus:read"]);
  });

  it("records last use, and a revoked key stops working on its very next request", async () => {
    const k = await createApiKey(A.orgId, { name: "Revoke me", scopes: ["menus:read"] }, A.userId);
    expect((await call(listMenus, "/api/v1/menus", { key: k.key })).status).toBe(200);
    expect((await prisma.apiKey.findUniqueOrThrow({ where: { id: k.apiKey.id } })).lastUsedAt).not.toBeNull();
    await revokeApiKey(A.orgId, k.apiKey.id, A.userId);
    const after = await call(listMenus, "/api/v1/menus", { key: k.key });
    expect(after.status).toBe(401);
    expect(after.body.error?.code).toBe("API_KEY_REVOKED");
  });

  it("cannot revoke another kitchen's key", async () => {
    const k = await createApiKey(B.orgId, { name: "B's", scopes: ["menus:read"] }, B.userId);
    await expect(revokeApiKey(A.orgId, k.apiKey.id, A.userId)).rejects.toThrow();
    expect((await authenticateApiKey(`Bearer ${k.key}`)).ok).toBe(true);
  });
});

describe("authentication", () => {
  it("answers 401 with a Bearer challenge for a missing, malformed or wrong key, and never says which part was wrong", async () => {
    const wrongSecret = `${A.key.slice(0, -4)}AAAA`;
    for (const key of [null, "not-a-key", "plt_live_000000000000_" + "x".repeat(43), wrongSecret]) {
      const r = await call(getKitchen, "/api/v1/kitchen", { key });
      expect(r.status, String(key)).toBe(401);
      expect(r.headers.get("www-authenticate")).toContain("Bearer");
      expect(r.body.data).toBeUndefined();
    }
    const basic = await call(getKitchen, "/api/v1/kitchen", { headers: { authorization: "Basic abc" } });
    expect(basic.status).toBe(401);
  });

  it("knows the kitchen from the key alone", async () => {
    const r = await call(getKitchen, "/api/v1/kitchen", { key: A.key });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ id: A.orgId, api_key: { name: "All" } });
    expect(r.body.data.api_key.scopes).toHaveLength(API_SCOPES.length);
    expect(r.headers.get("x-request-id")).toBeTruthy();
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("is refused when the kitchen is suspended or its plan has ended, and works again afterwards", async () => {
    const k = await kitchen("lock");
    await prisma.organization.update({ where: { id: k.orgId }, data: { status: "SUSPENDED" } });
    const suspended = await call(getKitchen, "/api/v1/kitchen", { key: k.key });
    expect([suspended.status, suspended.body.error?.code]).toEqual([403, "ACCOUNT_INACTIVE"]);
    await prisma.organization.update({ where: { id: k.orgId }, data: { status: "ACTIVE" } });
    const plan = await prisma.subscriptionPlan.create({ data: { code: `lock-${crypto.randomUUID()}`, name: "Lock" } });
    await prisma.subscription.create({ data: { organizationId: k.orgId, subscriptionPlanId: plan.id, status: "TRIALING", startDate: new Date(Date.now() - 20 * 86_400_000), trialEndsAt: new Date(Date.now() - 86_400_000) } });
    const locked = await call(getKitchen, "/api/v1/kitchen", { key: k.key });
    expect([locked.status, locked.body.error?.code]).toEqual([403, "ACCOUNT_LOCKED"]);
    await prisma.subscription.deleteMany({ where: { organizationId: k.orgId } });
    expect((await call(getKitchen, "/api/v1/kitchen", { key: k.key })).status).toBe(200);
    await prisma.subscriptionPlan.delete({ where: { id: plan.id } });
  });
});

describe("scopes", () => {
  it("refuses a read-only key on every write, and a key without a scope on that resource", async () => {
    const writes: [unknown, string, string, unknown][] = [
      [postCustomer, "POST", "/api/v1/customers", { name: "X", phone: "+919800000000" }],
      [postOrder, "POST", "/api/v1/orders", { customer_id: A.ids.customer, event_start_date: future(30) }],
    ];
    for (const [handler, method, path, body] of writes) {
      const r = await call(handler, path, { method, key: A.readKey, body });
      expect([r.status, r.body.error?.code], path).toEqual([403, "INSUFFICIENT_SCOPE"]);
    }
    for (const [handler, path] of [[patchCustomer, "/api/v1/customers/x"], [patchOrder, "/api/v1/orders/x"]] as const) {
      expect((await call(handler, path, { method: "PATCH", key: A.readKey, body: {}, id: A.ids.customer })).status, path).toBe(403);
    }
    const menusOnly = (await createApiKey(A.orgId, { name: "menus", scopes: ["menus:read"] }, A.userId)).key;
    for (const [handler, path] of [[listOrders, "/api/v1/orders"], [listCustomers, "/api/v1/customers"], [listEvents, "/api/v1/events"], [listAddOns, "/api/v1/addons"]] as const) {
      const r = await call(handler, path, { key: menusOnly });
      expect([r.status, r.body.error?.code], path).toEqual([403, "INSUFFICIENT_SCOPE"]);
    }
    expect((await call(listMenus, "/api/v1/menus", { key: menusOnly })).status).toBe(200);
  });
});

describe("tenant isolation (release blocker)", () => {
  const detail: [string, unknown, string, (k: Kitchen) => string][] = [
    ["menus", getMenu, "/api/v1/menus/", (k) => k.ids.menu],
    ["menu-items", getMenuItem, "/api/v1/menu-items/", (k) => k.ids.menuItem],
    ["addons", getAddOn, "/api/v1/addons/", (k) => k.ids.addOn],
    ["customers", getCustomer, "/api/v1/customers/", (k) => k.ids.customer],
    ["events", getEvent, "/api/v1/events/", (k) => k.ids.event],
    ["events/meal-plans", getEventMealPlans, "/api/v1/events/", (k) => k.ids.event],
    ["meal-plans", getMealPlan, "/api/v1/meal-plans/", (k) => k.ids.mealPlan],
    ["orders", getOrder, "/api/v1/orders/", (k) => k.ids.order],
  ];

  it("each kitchen reads its own records by id", async () => {
    for (const [name, handler, base, pick] of detail) {
      const r = await call(handler, `${base}${pick(A)}`, { key: A.key, id: pick(A) });
      expect(r.status, name).toBe(200);
    }
  });

  it("kitchen A's key asking for kitchen B's id gets 404, on every resource, and no sign the record exists", async () => {
    for (const [name, handler, base, pick] of detail) {
      const r = await call(handler, `${base}${pick(B)}`, { key: A.key, id: pick(B) });
      expect([r.status, r.body.error?.code], name).toEqual([404, "NOT_FOUND"]);
      expect(JSON.stringify(r.body), name).not.toContain("b Customer");
    }
    // The event meal-plans route for a foreign event id is a 404 too, not an empty list.
  });

  it("lists never contain the other kitchen's rows, however they are filtered", async () => {
    const lists: [string, unknown, string][] = [
      ["menus", listMenus, "/api/v1/menus"],
      ["menu-items", listMenuItems, "/api/v1/menu-items"],
      ["addons", listAddOns, "/api/v1/addons"],
      ["customers", listCustomers, "/api/v1/customers"],
      ["events", listEvents, "/api/v1/events"],
      ["orders", listOrders, "/api/v1/orders"],
    ];
    for (const [name, handler, path] of lists) {
      const r = await call(handler, path, { key: A.key });
      expect(r.status, name).toBe(200);
      expect(JSON.stringify(r.body.data), name).not.toMatch(/\bb (Customer|Menu|Paneer|Chaat|Event)\b/);
      expect(r.body.data.length, name).toBeGreaterThanOrEqual(1);
    }
    // Filtering by B's customer id returns nothing, not B's orders.
    const byForeignCustomer = await call(listOrders, `/api/v1/orders?customer_id=${B.ids.customer}`, { key: A.key });
    expect(byForeignCustomer.body.data).toEqual([]);
    expect((await call(listEvents, `/api/v1/events?customer_id=${B.ids.customer}`, { key: A.key })).body.data).toEqual([]);
  });

  it("a tenant id sent by the caller is refused, never obeyed", async () => {
    for (const param of ["organization_id", "tenant_id", "organizationId", "kitchen_id"]) {
      const r = await call(listOrders, `/api/v1/orders?${param}=${B.orgId}`, { key: A.key });
      expect([r.status, r.body.error?.code], param).toEqual([422, "VALIDATION_ERROR"]);
    }
    const body = await call(postCustomer, "/api/v1/customers", { method: "POST", key: A.key, body: { name: "Sneaky", phone: "+919811111111", organization_id: B.orgId } });
    expect(body.status).toBe(422);
    expect(await prisma.customer.count({ where: { name: "Sneaky" } })).toBe(0);
  });

  it("writes cannot touch or point at the other kitchen's records", async () => {
    const patchB = await call(patchCustomer, `/api/v1/customers/${B.ids.customer}`, { method: "PATCH", key: A.key, body: { name: "Hacked" }, id: B.ids.customer });
    expect(patchB.status).toBe(404);
    const patchOrderB = await call(patchOrder, `/api/v1/orders/${B.ids.order}`, { method: "PATCH", key: A.key, body: { notes: "Hacked" }, id: B.ids.order });
    expect(patchOrderB.status).toBe(404);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: B.ids.customer } })).name).toBe("b Customer");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: B.ids.order } })).notes).toBe("visible note");

    const foreignCustomer = await call(postOrder, "/api/v1/orders", { method: "POST", key: A.key, body: { customer_id: B.ids.customer, event_start_date: future(40) } });
    expect([foreignCustomer.status, foreignCustomer.body.error?.message]).toEqual([422, "That customer doesn't exist."]);
    const foreignType = await call(postOrder, "/api/v1/orders", { method: "POST", key: A.key, body: { customer_id: A.ids.customer, event_type_id: B.ids.eventType, event_start_date: future(40) } });
    expect([foreignType.status, foreignType.body.error?.message]).toEqual([422, "That event type doesn't exist."]);
    const foreignMenu = await call(postOrder, "/api/v1/orders", { method: "POST", key: A.key, body: { customer_id: A.ids.customer, event_start_date: future(40), meal_plans: [{ date: future(40), meal_type: "LUNCH", menu_id: B.ids.menu }] } });
    expect(foreignMenu.status).toBe(404);
    const foreignItem = await call(postOrder, "/api/v1/orders", { method: "POST", key: A.key, body: { customer_id: A.ids.customer, event_start_date: future(40), meal_plans: [{ date: future(40), meal_type: "LUNCH", items: [{ item_type: "MENU_ITEM", catalog_id: B.ids.menuItem }] }] } });
    expect(foreignItem.status).toBeGreaterThanOrEqual(400);
    expect(await prisma.order.count({ where: { organizationId: A.orgId, customerId: B.ids.customer } })).toBe(0);
    expect(await prisma.orderItem.count({ where: { menuItemId: B.ids.menuItem } })).toBe(0);
  });
});

describe("what the API returns", () => {
  it("exposes only the documented fields: no internal notes, organization ids, or hashes", async () => {
    const order = await call(getOrder, `/api/v1/orders/${A.ids.order}`, { key: A.key, id: A.ids.order });
    const text = JSON.stringify(order.body);
    expect(text).not.toContain("SECRET kitchen note");
    expect(text).not.toContain(A.orgId);
    expect(text).not.toMatch(/organization|keyHash|kitchenNotes|stockDeducted|individual/i);
    expect(order.body.data).toMatchObject({ id: A.ids.order, status: "PENDING_REVIEW", notes: "visible note", amounts: { total: 20000, balance: 20000 }, guests: { adults: 50, total: 50 } });
    expect(order.body.data.meal_plans[0]).toMatchObject({ meal_type: "DINNER", menu_name: "a Menu", price_per_plate: 400 });
    const event = await call(getEvent, `/api/v1/events/${A.ids.event}`, { key: A.key, id: A.ids.event });
    expect(JSON.stringify(event.body)).not.toContain("internal event note");
    const customer = await call(getCustomer, `/api/v1/customers/${A.ids.customer}`, { key: A.key, id: A.ids.customer });
    expect(Object.keys(customer.body.data).sort()).toEqual(["created_at", "email", "id", "is_active", "lead_source", "name", "order_count", "phone", "status", "updated_at"]);
  });

  it("reads an event's meal plans through its order", async () => {
    const r = await call(getEventMealPlans, `/api/v1/events/${A.ids.event}/meal-plans`, { key: A.key, id: A.ids.event });
    expect(r.body.data).toHaveLength(1);
    expect(r.body.data[0].id).toBe(A.ids.mealPlan);
  });
});

describe("validation and pagination", () => {
  it("never returns an unlimited list: pages are bounded and the meta says where you are", async () => {
    const r = await call(listOrders, "/api/v1/orders", { key: A.key });
    expect(r.body.meta).toMatchObject({ page: 1, per_page: 25, total: expect.any(Number), total_pages: expect.any(Number) });
    const tooMany = await call(listOrders, "/api/v1/orders?per_page=1000", { key: A.key });
    expect([tooMany.status, tooMany.body.error?.code]).toEqual([422, "VALIDATION_ERROR"]);
    for (const bad of ["page=0", "page=-1", "page=abc", "per_page=0", "per_page=1.5", "page=1&page=2"]) expect((await call(listOrders, `/api/v1/orders?${bad}`, { key: A.key })).status, bad).toBe(422);
    const one = await call(listCustomers, "/api/v1/customers?per_page=1&page=1", { key: A.key });
    expect(one.body.data).toHaveLength(1);
    expect(one.body.meta.per_page).toBe(1);
  });

  it("validates filters, dates, enums and ids, listing every problem", async () => {
    expect((await call(listOrders, "/api/v1/orders?status=NOPE", { key: A.key })).status).toBe(422);
    expect((await call(listOrders, "/api/v1/orders?event_from=31-12-2030", { key: A.key })).status).toBe(422);
    expect((await call(listEvents, "/api/v1/events?from=2030-02-31", { key: A.key })).status).toBe(422);
    const bad = await call(postCustomer, "/api/v1/customers", { method: "POST", key: A.key, body: { name: "", phone: "abc", email: "nope", extra: 1 } });
    expect(bad.status).toBe(422);
    expect((bad.body.error?.details as { field: string }[]).map((d) => d.field).sort()).toEqual(["email", "extra", "name", "phone"]);
    expect((await call(getOrder, "/api/v1/orders/bad%20id", { key: A.key, id: "bad id" })).status).toBe(404);
    expect((await call(getOrder, "/api/v1/orders/x", { key: A.key, id: "x".repeat(100) })).status).toBe(404);
  });

  it("answers 415 for a body that is not JSON, 400 for broken JSON, and keeps database errors to itself", async () => {
    const notJson = await (postCustomer as Handler)(new Request("http://catering.localhost:3000/api/v1/customers", { method: "POST", headers: { authorization: `Bearer ${A.key}`, "content-type": "text/plain" }, body: "x" }), { params: Promise.resolve({} as never) });
    expect(notJson.status).toBe(415);
    const broken = await (postCustomer as Handler)(new Request("http://catering.localhost:3000/api/v1/customers", { method: "POST", headers: { authorization: `Bearer ${A.key}`, "content-type": "application/json" }, body: "{oops" }), { params: Promise.resolve({} as never) });
    expect(broken.status).toBe(400);
    expect(JSON.stringify(await broken.json())).not.toMatch(/prisma|SELECT|node_modules/i);
  });
});

describe("creating and changing customers and orders", () => {
  it("creates a customer once: a repeat with the same Idempotency-Key replays, a repeat without one is a clear conflict", async () => {
    const headers = { "idempotency-key": `cust-${crypto.randomUUID()}` };
    const first = await call(postCustomer, "/api/v1/customers", { method: "POST", key: A.key, headers, body: { name: "Meera", phone: "+91 98765 00001", email: "meera@x.test" } });
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({ name: "Meera", status: "LEAD", phone: "+919876500001" });
    const replay = await call(postCustomer, "/api/v1/customers", { method: "POST", key: A.key, headers, body: { name: "Meera", phone: "+91 98765 00001", email: "meera@x.test" } });
    expect([replay.status, replay.body.data.id, replay.headers.get("idempotent-replayed")]).toEqual([201, first.body.data.id, "true"]);
    expect(await prisma.customer.count({ where: { organizationId: A.orgId, phone: "+919876500001" } })).toBe(1);
    const dup = await call(postCustomer, "/api/v1/customers", { method: "POST", key: A.key, body: { name: "Meera again", phone: "9876500001" } });
    expect([dup.status, dup.body.error?.code]).toEqual([409, "CUSTOMER_ALREADY_EXISTS"]);
    expect(dup.body.error?.details).toEqual({ customer_id: first.body.data.id });
    const reused = await call(postCustomer, "/api/v1/customers", { method: "POST", key: A.key, headers, body: { name: "Someone else", phone: "+919876500002" } });
    expect([reused.status, reused.body.error?.code]).toEqual([409, "IDEMPOTENCY_KEY_REUSED"]);
  });

  it("changes a customer's details, but not into another customer's phone number", async () => {
    const made = await call(postCustomer, "/api/v1/customers", { method: "POST", key: A.key, body: { name: "Ravi", phone: "+919876500010" } });
    const id = made.body.data.id as string;
    const ok = await call(patchCustomer, `/api/v1/customers/${id}`, { method: "PATCH", key: A.key, id, body: { name: "Ravi K", is_active: false } });
    expect(ok.body.data).toMatchObject({ name: "Ravi K", is_active: false, phone: "+919876500010" });
    const clash = await call(patchCustomer, `/api/v1/customers/${id}`, { method: "PATCH", key: A.key, id, body: { phone: "+919876500001" } });
    expect([clash.status, clash.body.error?.code]).toEqual([409, "CUSTOMER_ALREADY_EXISTS"]);
  });

  it("places an order with its meals: prices come from the catalog, the event and menu selection appear, a retry makes no second order", async () => {
    const headers = { "idempotency-key": `order-${crypto.randomUUID()}` };
    const body = {
      customer_id: A.ids.customer,
      event_type_id: A.ids.eventType,
      event_start_date: future(45),
      venue: "Grand Hall",
      adult_count: 40,
      child_5_to_10_count: 10,
      meal_plans: [{ date: future(45), meal_type: "LUNCH", menu_id: A.ids.menu, items: [{ item_type: "MENU_ITEM", catalog_id: A.ids.menuItem, quantity: 1 }, { item_type: "ADD_ON", catalog_id: A.ids.addOn }] }],
    };
    const before = await prisma.order.count({ where: { organizationId: A.orgId } });
    const first = await call(postOrder, "/api/v1/orders", { method: "POST", key: A.key, headers, body });
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({ status: "PENDING_REVIEW", order_kind: "SINGLE", guests: { adults: 40, children_5_to_10: 10, total: 50 }, payment_status: "UNPAID" });
    expect(first.body.data.order_number).toBeTruthy();
    expect(first.body.data.event_ids).toHaveLength(1);
    const item = first.body.data.meal_plans[0].items.find((i: { item_type: string }) => i.item_type === "MENU_ITEM");
    expect(item).toMatchObject({ name: "a Paneer", unit_price: 150 });
    expect(first.body.data.amounts.total).toBeGreaterThan(0);
    const replay = await call(postOrder, "/api/v1/orders", { method: "POST", key: A.key, headers, body });
    expect([replay.status, replay.body.data.id]).toEqual([201, first.body.data.id]);
    expect(await prisma.order.count({ where: { organizationId: A.orgId } })).toBe(before + 1);
  });

  it("refuses the things an integration must not set: status, payment, discounts, prices and past dates", async () => {
    for (const field of [{ status: "COMPLETED" }, { payment_status: "PAID" }, { advance: 5000 }, { discount: 100 }, { total: 1 }, { kitchen_notes: "x" }]) {
      const r = await call(postOrder, "/api/v1/orders", { method: "POST", key: A.key, body: { customer_id: A.ids.customer, event_start_date: future(50), ...field } });
      expect([r.status, r.body.error?.code], JSON.stringify(field)).toEqual([422, "VALIDATION_ERROR"]);
    }
    const priced = await call(postOrder, "/api/v1/orders", { method: "POST", key: A.key, body: { customer_id: A.ids.customer, event_start_date: future(50), meal_plans: [{ date: future(50), meal_type: "LUNCH", price: 1 }] } });
    expect(priced.status).toBe(422);
    const past = await call(postOrder, "/api/v1/orders", { method: "POST", key: A.key, body: { customer_id: A.ids.customer, event_start_date: "2020-01-01" } });
    expect([past.status, past.body.error?.message]).toEqual([422, "Event Date can't be in the past."]);
    const backwards = await call(postOrder, "/api/v1/orders", { method: "POST", key: A.key, body: { customer_id: A.ids.customer, event_start_date: future(60), event_end_date: future(55) } });
    expect(backwards.status).toBe(422);
  });

  it("changes an order's details; the meal plan only while it is Pending Review; a closed order not at all", async () => {
    const made = await call(postOrder, "/api/v1/orders", { method: "POST", key: A.key, body: { customer_id: A.ids.customer, event_start_date: future(70), venue: "Old Hall", adult_count: 20 } });
    const id = made.body.data.id as string;
    const edited = await call(patchOrder, `/api/v1/orders/${id}`, { method: "PATCH", key: A.key, id, body: { venue: "New Hall", child_below_5_count: 3, meal_plans: [{ date: future(70), meal_type: "DINNER", menu_id: A.ids.menu }] } });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({ venue: "New Hall", guests: { adults: 20, children_below_5: 3, total: 23 } });
    expect(edited.body.data.meal_plans).toHaveLength(1);
    expect((await call(patchOrder, `/api/v1/orders/${id}`, { method: "PATCH", key: A.key, id, body: { status: "COMPLETED" } })).status).toBe(422);

    await prisma.order.update({ where: { id }, data: { status: "APPROVED" } });
    const locked = await call(patchOrder, `/api/v1/orders/${id}`, { method: "PATCH", key: A.key, id, body: { meal_plans: [] } });
    expect([locked.status, locked.body.error?.code]).toEqual([409, "MEAL_PLAN_LOCKED"]);
    expect((await call(patchOrder, `/api/v1/orders/${id}`, { method: "PATCH", key: A.key, id, body: { venue: "Still editable" } })).status).toBe(200);

    await prisma.order.update({ where: { id }, data: { status: "CANCELLED" } });
    const closed = await call(patchOrder, `/api/v1/orders/${id}`, { method: "PATCH", key: A.key, id, body: { venue: "Too late" } });
    expect([closed.status, closed.body.error?.code]).toEqual([409, "ORDER_CLOSED"]);
  });
});

describe("rate limiting", () => {
  it("answers 429 with headers once a key passes its limit, and does not touch another key or kitchen", async () => {
    const limited = (await createApiKey(A.orgId, { name: "Busy", scopes: ["menus:read"] }, A.userId)).key;
    const first = await call(listMenus, "/api/v1/menus", { key: limited });
    expect(first.headers.get("x-ratelimit-limit")).toBe("120");
    expect(Number(first.headers.get("x-ratelimit-remaining"))).toBe(119);
    let last = first;
    for (let i = 0; i < 119; i++) last = await call(listMenus, "/api/v1/menus", { key: limited });
    expect(last.status).toBe(200);
    expect(last.headers.get("x-ratelimit-remaining")).toBe("0");
    const over = await call(listMenus, "/api/v1/menus", { key: limited });
    expect([over.status, over.body.error?.code]).toEqual([429, "RATE_LIMITED"]);
    expect(Number(over.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await call(listMenus, "/api/v1/menus", { key: A.readKey })).status).toBe(200); // another key of the same kitchen
    expect((await call(listMenus, "/api/v1/menus", { key: B.key })).status).toBe(200); // another kitchen
  }, 60_000);
});
