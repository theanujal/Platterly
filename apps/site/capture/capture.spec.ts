import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { test, expect, request as pwRequest, type Page } from "@playwright/test";
import { Pool } from "pg";
import { signUpCaterer } from "../../../e2e/auth-helpers";
import { activatePaidPlan, cleanupOnboardingTestUser } from "../../../e2e/db";

const OUT = path.resolve(__dirname, "../public/media");
const RAW = path.resolve(__dirname, "../scripts/.raw");
const EMAIL = "priya@spiceroute.example.test";
const BASE = process.env.PW_BASE_URL ?? "http://catering.localhost:3000";

const pool = new Pool({ connectionString: process.env.DATABASE_URL?.split("?")[0] });
const id = () => crypto.randomUUID();
const day = (offset: number) => {
  // The local calendar date (the app compares event dates with the local "today").
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** A full-page PNG at 2x, written as the 1600x1000 WebP the site uses. */
async function shot(page: Page, name: string, clip?: { x: number; y: number; width: number; height: number }) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(RAW, { recursive: true });
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(600);
  const png = await page.screenshot({ clip: clip ?? { x: 0, y: 0, width: 1280, height: 800 } });
  fs.writeFileSync(path.join(RAW, `${name}.png`), png);
  // scripts/optimize-media.mjs turns the raw PNGs into the site's WebP files.
}

let orgId = "";
const ids: Record<string, string> = {};

test.afterAll(async () => {
  await cleanupOnboardingTestUser(EMAIL).catch(() => undefined);
  await pool.end();
});

const HIDE_DEV_UI = `nextjs-portal, [data-nextjs-dev-tools-button], [data-next-badge-root], [data-feedback-toolbar], [data-agentation-root], [data-agentation-toolbar] { display: none !important; }`;

test("capture the catering app for the marketing site", async ({ page, browser }) => {
  await page.context().addInitScript((css) => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = css;
      document.head.appendChild(style);
    });
  }, HIDE_DEV_UI);
  // ---------- 1. A demo kitchen ----------
  await cleanupOnboardingTestUser(EMAIL).catch(() => undefined); // a leftover from an interrupted run
  await signUpCaterer(page, EMAIL, { firstName: "Priya", lastName: "Menon", phone: "9800000101" });
  const { rows } = await pool.query<{ organizationId: string }>('SELECT m."organizationId" FROM member m JOIN "user" u ON u.id = m."userId" WHERE u.email = $1', [EMAIL]);
  orgId = rows[0].organizationId;
  // A finished-looking kitchen: named, link claimed, profile complete, on a paid plan (so no trial box or nudges in the pictures).
  await pool.query(
    `UPDATE organization SET name = 'Spice Route Catering', "slugChangeCount" = 1, "onboardingCompletedAt" = now(), "addressLine1" = '14, Residency Road', city = 'Bengaluru', state = 'Karnataka', "contactEmail" = 'orders@spiceroute.example.test', "contactPhone" = '+919800000100' WHERE id = $1`,
    [orgId],
  );
  await activatePaidPlan(EMAIL, "premium", 30);

  // ---------- 2. A menu catalog (SQL: the catalog screens have their own specs) ----------
  const cats: Record<string, string> = {};
  for (const [i, name] of ["Starters", "Main Course", "Breads and Rice", "Desserts"].entries()) {
    cats[name] = id();
    await pool.query(`INSERT INTO menu_category (id, "organizationId", name, "updatedAt") VALUES ($1,$2,$3,now())`, [cats[name], orgId, name]);
    void i;
  }
  const items: { name: string; cat: string; veg: boolean; price: number }[] = [
    { name: "Paneer Tikka", cat: "Starters", veg: true, price: 140 },
    { name: "Hara Bhara Kebab", cat: "Starters", veg: true, price: 120 },
    { name: "Chicken Tikka", cat: "Starters", veg: false, price: 180 },
    { name: "Fish Fry", cat: "Starters", veg: false, price: 200 },
    { name: "Dal Makhani", cat: "Main Course", veg: true, price: 110 },
    { name: "Paneer Butter Masala", cat: "Main Course", veg: true, price: 150 },
    { name: "Butter Chicken", cat: "Main Course", veg: false, price: 220 },
    { name: "Mutton Rogan Josh", cat: "Main Course", veg: false, price: 280 },
    { name: "Veg Biryani", cat: "Breads and Rice", veg: true, price: 130 },
    { name: "Chicken Biryani", cat: "Breads and Rice", veg: false, price: 210 },
    { name: "Butter Naan", cat: "Breads and Rice", veg: true, price: 40 },
    { name: "Gulab Jamun", cat: "Desserts", veg: true, price: 60 },
    { name: "Rasmalai", cat: "Desserts", veg: true, price: 80 },
  ];
  const itemId: Record<string, string> = {};
  for (const it of items) {
    itemId[it.name] = id();
    await pool.query(`INSERT INTO menu_item (id, "organizationId", name, "foodType", price, "updatedAt") VALUES ($1,$2,$3,$4::"FoodType",$5,now())`, [itemId[it.name], orgId, it.name, it.veg ? "VEGETARIAN" : "NON_VEGETARIAN", it.price]);
    await pool.query(`INSERT INTO menu_item_category (id, "menuItemId", "categoryId") VALUES ($1,$2,$3)`, [id(), itemId[it.name], cats[it.cat]]);
  }
  const menus = [
    { key: "classic", name: "Classic Veg Thali", type: "VEGETARIAN", price: 650, from: items.filter((i) => i.veg) },
    { key: "royal", name: "Royal Non-Veg Feast", type: "NON_VEGETARIAN", price: 950, from: items },
    { key: "lunch", name: "Corporate Lunch Box", type: "VEGETARIAN", price: 320, from: items.filter((i) => i.veg && i.cat !== "Starters") },
  ];
  const menuId: Record<string, string> = {};
  for (const m of menus) {
    menuId[m.key] = id();
    await pool.query(`INSERT INTO menu (id, "organizationId", name, "menuType", "pricePerPlate", "updatedAt") VALUES ($1,$2,$3,$4::"FoodType",$5,now())`, [menuId[m.key], orgId, m.name, m.type, m.price]);
    for (const [n, it] of m.from.entries()) await pool.query(`INSERT INTO menu_menu_item (id, "menuId", "menuItemId", "sortOrder") VALUES ($1,$2,$3,$4)`, [id(), menuId[m.key], itemId[it.name], n]);
    for (const [n, c] of Object.values(cats).entries()) await pool.query(`INSERT INTO menu_category_assignment (id, "menuId", "categoryId", "maxSelection", "sortOrder") VALUES ($1,$2,$3,$4,$5)`, [id(), menuId[m.key], c, 3, n]);
  }
  const eventTypes: Record<string, string> = {};
  for (const [n, name] of ["Wedding", "Corporate Lunch", "Birthday Party"].entries()) {
    eventTypes[name] = id();
    await pool.query(`INSERT INTO event_type (id, "organizationId", name, "sortOrder", "updatedAt") VALUES ($1,$2,$3,$4,now())`, [eventTypes[name], orgId, name, n]);
    for (const key of Object.keys(menuId)) await pool.query(`INSERT INTO event_type_menu (id, "eventTypeId", "menuId") VALUES ($1,$2,$3)`, [id(), eventTypes[name], menuId[key]]);
  }

  // ---------- 3. An API key, then customers and orders through the app's own public API ----------
  await page.goto("/settings/integration/api-webhooks");
  await page.getByLabel("Name", { exact: true }).fill("Demo seed");
  for (const scope of ["customers:read", "customers:write", "orders:read", "orders:write", "menus:read"]) await page.getByRole("checkbox", { name: new RegExp(scope) }).click();
  await page.getByRole("button", { name: "Create API Key" }).click();
  const key = (await page.getByTestId("new-api-key").textContent())!.trim();
  const api = await pwRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { Authorization: `Bearer ${key}` } });

  const people = [
    ["Ananya Kapoor", "9800000111", "ananya.kapoor@example.test"],
    ["Vikram Nair", "9800000112", "vikram.nair@example.test"],
    ["Meera Iyer", "9800000113", "meera.iyer@example.test"],
    ["Arjun Desai", "9800000114", "arjun.desai@example.test"],
    ["Sneha Patil", "9800000115", "sneha.patil@example.test"],
    ["Rahul Verma", "9800000116", "rahul.verma@example.test"],
    ["Kavya Reddy", "9800000117", "kavya.reddy@example.test"],
    ["Imran Sheikh", "9800000118", "imran.sheikh@example.test"],
  ];
  const cust: string[] = [];
  for (const [name, phone, email] of people) {
    const res = await api.post("/api/v1/customers", { data: { name, phone: `+91${phone}`, email }, headers: { "Idempotency-Key": `seed-${phone}` } });
    expect(res.status(), await res.text()).toBe(201);
    cust.push((await res.json()).data.id);
  }

  const pick = (...names: string[]) => names.map((n) => ({ item_type: "MENU_ITEM", catalog_id: itemId[n] }));
  const order = async (customer: number, body: Record<string, unknown>, key: string) => {
    const res = await api.post("/api/v1/orders", { data: { customer_id: cust[customer], ...body }, headers: { "Idempotency-Key": `seed-order-${key}` } });
    expect(res.status(), await res.text()).toBe(201);
    return (await res.json()).data.id as string;
  };
  const veg = ["Paneer Tikka", "Dal Makhani", "Paneer Butter Masala", "Veg Biryani", "Butter Naan", "Gulab Jamun"];
  const nonveg = ["Chicken Tikka", "Fish Fry", "Butter Chicken", "Mutton Rogan Josh", "Chicken Biryani", "Butter Naan", "Rasmalai"];

  // A: a three-day wedding, the showcase order
  ids.A = await order(0, {
    event_type_id: eventTypes.Wedding, event_start_date: day(12), event_end_date: day(14), venue: "The Grand Orchid, Whitefield", event_address: "Whitefield Main Road, Bengaluru", menu_preference: "NON_VEGETARIAN",
    adult_count: 380, child_5_to_10_count: 50, child_below_5_count: 20, notes: "Haldi lunch on day one, reception dinner on day two, farewell lunch on day three.",
    meal_plans: [
      { date: day(12), meal_type: "LUNCH", menu_id: menuId.classic, items: pick(...veg) },
      { date: day(13), meal_type: "DINNER", menu_id: menuId.royal, items: pick(...nonveg) },
      { date: day(14), meal_type: "LUNCH", menu_id: menuId.classic, items: pick(...veg) },
    ],
  }, "A");
  ids.B = await order(1, { event_type_id: eventTypes["Corporate Lunch"], event_start_date: day(1), venue: "Embassy Tech Village, Bellandur", menu_preference: "VEGETARIAN", adult_count: 120, meal_plans: [{ date: day(1), meal_type: "LUNCH", menu_id: menuId.lunch, items: pick("Dal Makhani", "Paneer Butter Masala", "Veg Biryani", "Butter Naan") }] }, "B");
  ids.C = await order(2, { event_type_id: eventTypes["Birthday Party"], event_start_date: day(9), venue: "Lakeview Clubhouse, Indiranagar", menu_preference: "VEGETARIAN", adult_count: 40, child_5_to_10_count: 20, meal_plans: [{ date: day(9), meal_type: "DINNER", menu_id: menuId.classic, items: pick(...veg) }] }, "C");
  ids.D = await order(3, { event_type_id: eventTypes.Wedding, event_start_date: day(21), event_end_date: day(22), venue: "Palm Meadows Resort, Sarjapur", menu_preference: "NON_VEGETARIAN", adult_count: 520, child_5_to_10_count: 80, meal_plans: [{ date: day(21), meal_type: "DINNER", menu_id: menuId.royal, items: pick(...nonveg) }, { date: day(22), meal_type: "LUNCH", menu_id: menuId.royal, items: pick(...nonveg) }] }, "D");
  ids.E = await order(4, { event_type_id: eventTypes["Corporate Lunch"], event_start_date: day(5), venue: "Manyata Business Park", menu_preference: "VEGETARIAN", adult_count: 200, meal_plans: [{ date: day(5), meal_type: "LUNCH", menu_id: menuId.lunch, items: pick("Dal Makhani", "Veg Biryani", "Butter Naan", "Gulab Jamun") }] }, "E");
  ids.F = await order(5, { event_type_id: eventTypes["Birthday Party"], event_start_date: day(0), venue: "Sunrise Apartments Hall, Koramangala", menu_preference: "NON_VEGETARIAN", adult_count: 80, meal_plans: [{ date: day(0), meal_type: "LUNCH", menu_id: menuId.royal, items: pick("Chicken Tikka", "Butter Chicken", "Chicken Biryani", "Butter Naan") }] }, "F");
  ids.G = await order(6, { event_type_id: eventTypes.Wedding, event_start_date: day(2), venue: "Cubbon Park Pavilion", menu_preference: "VEGETARIAN", adult_count: 150, meal_plans: [{ date: day(2), meal_type: "DINNER", menu_id: menuId.classic, items: pick(...veg) }] }, "G");
  ids.H = await order(7, { event_type_id: eventTypes["Corporate Lunch"], event_start_date: day(1), venue: "Prestige Tech Park", menu_preference: "NON_VEGETARIAN", adult_count: 95, meal_plans: [{ date: day(1), meal_type: "LUNCH", menu_id: menuId.royal, items: pick("Chicken Tikka", "Butter Chicken", "Chicken Biryani", "Rasmalai") }] }, "H");

  // More bookings further out, so the calendar looks like a working month.
  ids.I = await order(0, { event_type_id: eventTypes["Corporate Lunch"], event_start_date: day(8), venue: "Global Tech Park, Whitefield", menu_preference: "VEGETARIAN", adult_count: 140, meal_plans: [{ date: day(8), meal_type: "LUNCH", menu_id: menuId.lunch, items: pick("Dal Makhani", "Veg Biryani", "Butter Naan") }] }, "I");
  ids.J = await order(2, { event_type_id: eventTypes["Birthday Party"], event_start_date: day(16), venue: "Orchid Garden, Hebbal", menu_preference: "VEGETARIAN", adult_count: 70, child_5_to_10_count: 25, meal_plans: [{ date: day(16), meal_type: "DINNER", menu_id: menuId.classic, items: pick(...veg) }] }, "J");
  ids.K = await order(3, { event_type_id: eventTypes.Wedding, event_start_date: day(19), event_end_date: day(20), venue: "Windsor Manor Lawns", menu_preference: "NON_VEGETARIAN", adult_count: 300, meal_plans: [{ date: day(19), meal_type: "DINNER", menu_id: menuId.royal, items: pick(...nonveg) }, { date: day(20), meal_type: "LUNCH", menu_id: menuId.royal, items: pick(...nonveg) }] }, "K");
  ids.L = await order(4, { event_type_id: eventTypes["Corporate Lunch"], event_start_date: day(23), venue: "RMZ Ecospace, Bellandur", menu_preference: "VEGETARIAN", adult_count: 180, meal_plans: [{ date: day(23), meal_type: "LUNCH", menu_id: menuId.lunch, items: pick("Dal Makhani", "Veg Biryani", "Butter Naan", "Gulab Jamun") }] }, "L");

  // ---------- 4. Where each order stands ----------
  // Real flows where there is a real screen for it: the team sends the menu, the customer approves it on their link.
  const selectionOf = async (orderId: string) => (await pool.query<{ id: string }>(`SELECT ms.id FROM menu_selection ms JOIN event e ON e.id = ms."eventId" WHERE e."orderId" = $1`, [orderId])).rows[0].id;
  const sendForApproval = async (orderId: string) => {
    await page.goto(`/menu-approvals/${await selectionOf(orderId)}`);
    // The first click can land before the page's handlers are attached on a freshly compiled route, so retry until it takes.
    await expect(async () => {
      const send = page.getByRole("button", { name: "Send Menu for Approval" });
      if (await send.isVisible()) await send.click();
      await expect(page.getByText(/Version 1 is with the customer/)).toBeVisible({ timeout: 4000 });
    }).toPass({ timeout: 40_000 });
    return new URL((await page.locator("code").filter({ hasText: "/menu-approval/" }).innerText()).trim()).pathname;
  };
  const customerContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  await customerContext.addInitScript((css) => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = css;
      document.head.appendChild(style);
    });
  }, HIDE_DEV_UI);
  const customerPage = await customerContext.newPage();
  for (const key of ["A", "E"]) {
    await customerPage.goto(await sendForApproval(ids[key]));
    await customerPage.getByRole("button", { name: "Approve Menu" }).click();
    await expect(customerPage.getByRole("heading", { name: "Venue & Delivery Details" })).toBeVisible();
  }
  const menuLink = await sendForApproval(ids.D); // left waiting for the customer; this is the page we show
  for (const [key, production] of [["F", "PENDING"], ["B", "IN_PREPARATION"], ["H", "PENDING"], ["G", "READY"], ["A", "PENDING"], ["E", "PENDING"], ["I", "PENDING"], ["J", "PENDING"], ["K", "PENDING"], ["L", "PENDING"]] as const) {
    await pool.query(`UPDATE "order" SET status = 'SENT_TO_KITCHEN'::"OrderStatus" WHERE id = $1`, [ids[key]]);
    const upd = await pool.query(`UPDATE menu_selection SET status = 'FINAL_LOCKED'::"MenuSelectionStatus", "lockedAt" = now(), "kitchenProductionStatus" = $2::"KitchenProductionStatus" WHERE "eventId" IN (SELECT id FROM event WHERE "orderId" = $1)`, [ids[key], production]);
    expect(upd.rowCount, `menu selection for order ${key}`).toBeGreaterThan(0);
  }
  const pay = async (orderId: string, amount: number, type: "ADVANCE" | "PARTIAL" | "FINAL", method: string) => {
    await pool.query(`INSERT INTO payment (id, "organizationId", "orderId", amount, type, method, status, source, "receivedAt", "confirmedAt", "updatedAt") VALUES ($1,$2,$3,$4,$5::"PaymentType",$6::"PaymentMethod",'CONFIRMED','MANUAL',now() - interval '2 days',now() - interval '2 days',now())`, [id(), orgId, orderId, amount, type, method]);
    await pool.query(`UPDATE "order" SET advance = advance + $2, balance = GREATEST(total - (advance + $2), 0), "paymentStatus" = CASE WHEN total - (advance + $2) <= 0 THEN 'PAID'::"OrderPaymentStatus" ELSE 'PARTIALLY_PAID'::"OrderPaymentStatus" END WHERE id = $1`, [orderId, amount]);
  };
  const totals = Object.fromEntries((await pool.query<{ id: string; total: string }>(`SELECT id, total FROM "order" WHERE "organizationId" = $1`, [orgId])).rows.map((r) => [r.id, Number(r.total)]));
  await pay(ids.A, Math.round(totals[ids.A] * 0.5), "ADVANCE", "BANK_TRANSFER");
  await pay(ids.B, totals[ids.B], "FINAL", "UPI");
  await pay(ids.E, Math.round(totals[ids.E] * 0.3), "ADVANCE", "UPI");
  await pay(ids.G, Math.round(totals[ids.G] * 0.4), "ADVANCE", "CASH");
  await pay(ids.F, Math.round(totals[ids.F] * 0.5), "ADVANCE", "UPI");
  await pay(ids.H, Math.round(totals[ids.H] * 0.5), "ADVANCE", "CARD");
  await pay(ids.I, Math.round(totals[ids.I] * 0.25), "ADVANCE", "UPI");
  await pay(ids.K, Math.round(totals[ids.K] * 0.5), "ADVANCE", "BANK_TRANSFER");

  // ---------- 5. Pictures ----------
  const open = async (url: string) => {
    await page.goto(url);
    await page.waitForLoadState("domcontentloaded");
  };
  await customerPage.goto(menuLink);
  await shot(customerPage, "menu-link");
  await customerContext.close();
  await open("/dashboard");
  await shot(page, "dashboard");
  await open("/orders");
  await shot(page, "orders");
  await open("/customers");
  await shot(page, "customers");
  await open("/calendar");
  await shot(page, "calendar");
  await open("/kitchen-dashboard");
  await shot(page, "kitchen");
  await open(`/orders/${ids.A}`);
  await page.getByRole("tab", { name: "Guests & Menu Planning" }).click();
  await shot(page, "menu-planning");
  await page.getByRole("tab", { name: "Pricing & Payment" }).click();
  await shot(page, "payments");
  // Staffing as numbers per duty, next to the logistics card
  await page.getByRole("tab", { name: "Staffing & Logistics" }).click();
  const staffing = page.getByTestId("staffing-counts-card");
  for (const [duty, count] of [["Event Manager", "4"], ["Kitchen", "18"], ["Serving", "42"], ["Delivery", "6"], ["Setup", "10"], ["Store", "3"]]) await staffing.getByLabel(duty, { exact: true }).fill(count);
  await staffing.getByRole("button", { name: "Save staffing" }).click();
  await expect(staffing.getByText("Saved.")).toBeVisible();
  const logistics = page.getByTestId("logistics-card");
  await logistics.getByLabel("Vehicle number").fill("KA 01 AB 1234");
  await logistics.getByLabel("Driver", { exact: true }).fill("Suresh");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await shot(page, "logistics");

  // ---------- 6. Clips (silent, short, looped on the site) ----------
  const record = async (name: string, steps: (p: Page) => Promise<void>) => {
    fs.mkdirSync(RAW, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: RAW, size: { width: 1280, height: 800 } }, storageState: await page.context().storageState() });
    await ctx.addInitScript((css) => {
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent = css;
        document.head.appendChild(style);
      });
    }, HIDE_DEV_UI);
    const p = await ctx.newPage();
    await steps(p);
    const video = p.video();
    await ctx.close();
    fs.copyFileSync((await video!.path()) as string, path.join(OUT, `${name}.webm`));
  };
  const pause = (p: Page, ms = 1400) => p.waitForTimeout(ms);
  await record("tour", async (p) => {
    await p.goto("/dashboard");
    await pause(p, 2200);
    await p.goto("/orders");
    await pause(p, 2000);
    await p.goto(`/orders/${ids.A}`);
    await pause(p, 1800);
    await p.getByRole("tab", { name: "Guests & Menu Planning" }).click();
    await pause(p, 2400);
    await p.mouse.wheel(0, 500);
    await pause(p, 1800);
    await p.getByRole("tab", { name: "Pricing & Payment" }).click();
    await pause(p, 2200);
  });
  await record("kitchen-board", async (p) => {
    await p.goto("/kitchen-dashboard");
    await pause(p, 2400);
    // Move the first Pending order on to In Preparation, the way the kitchen team does.
    try {
      await p.getByRole("combobox").first().click({ timeout: 4000 });
      await p.getByRole("option", { name: "In Preparation" }).click({ timeout: 4000 });
    } catch {
      /* the clip still shows the board if the control is not found */
    }
    await pause(p, 3200);
  });
});
