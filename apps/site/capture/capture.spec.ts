import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
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

  // ---------- 3. Customers and orders, through the app's own screens (Customers page and Create Order form) ----------
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
  for (const [name, phone, email] of people) {
    await page.goto("/customers");
    await page.getByRole("button", { name: "Add Customer" }).click();
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Phone", { exact: true }).fill(phone);
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Create customer" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  }

  const MENU = { classic: "Classic Veg Thali", royal: "Royal Non-Veg Feast", lunch: "Corporate Lunch Box" };
  type Meal = { date: number; meal: "Breakfast" | "Lunch" | "Hi-Tea" | "Dinner"; menu: string; items: string[] };
  type Spec = { event: string; start: number; end?: number; venue: string; address?: string; notes?: string; adults: number; kids5to10?: number; kidsBelow5?: number; meals: Meal[] };

  /** Create Order exactly as a team member does: customer, event type and dates, guests, one menu and its dishes per meal, venue, Save Order. */
  const order = async (customer: number, spec: Spec) => {
    await page.goto("/orders/new");
    const customerName = people[customer][0];
    const customerInput = page.getByLabel("Customer");
    await customerInput.click();
    await customerInput.fill(customerName);
    await page.getByRole("button", { name: new RegExp(customerName) }).click();
    await page.getByLabel("Event Type").click();
    await page.getByRole("option", { name: spec.event }).click();

    const picker = async (offset: number) => {
      const target = new Date(`${day(offset)}T00:00:00`);
      const label = target.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
      const popover = page.locator('[data-slot="popover-content"]');
      for (let i = 0; i < 12 && (await popover.locator("span.font-medium").textContent()) !== label; i++) await popover.getByRole("button", { name: "Next month" }).click();
      return { popover, dayName: String(target.getDate()) };
    };
    await page.getByLabel("Event Date").click();
    const from = await picker(spec.start);
    await from.popover.getByRole("button", { name: from.dayName, exact: true }).click();
    if (spec.end === undefined || spec.end === spec.start) await from.popover.getByRole("button", { name: from.dayName, exact: true }).click();
    else {
      const to = await picker(spec.end);
      await to.popover.getByRole("button", { name: to.dayName, exact: true }).click();
    }
    // A date range (or a second meal) switches the order to Multi Order and says so once.
    const gotIt = page.getByRole("alertdialog").getByRole("button", { name: "Got it" });
    if (await gotIt.isVisible().catch(() => false)) await gotIt.click();

    await page.getByRole("tab", { name: "Guests & Menu Planning" }).click();
    await page.getByLabel("Adults").fill(String(spec.adults));
    if (spec.kidsBelow5) await page.getByLabel("Children (Under 5)").fill(String(spec.kidsBelow5));
    if (spec.kids5to10) await page.getByLabel("Children (5–10)").fill(String(spec.kids5to10));
    const sidebar = page.getByRole("navigation", { name: "Event Dates" });
    for (const m of spec.meals) {
      if (await sidebar.isVisible().catch(() => false)) await sidebar.getByText(new Date(`${day(m.date)}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })).click();
      await page.getByRole("button", { name: m.meal, exact: true }).click();
      if (await gotIt.isVisible().catch(() => false)) await gotIt.click();
      const slot = page.getByTestId(`meal-slot-${day(m.date)}-${m.meal.toUpperCase().replace("-", "_")}`);
      await slot.getByLabel("Menu").click();
      await page.getByRole("option", { name: m.menu }).click();
      await slot.getByRole("button", { name: "Select Food Items" }).click();
      const dialog = page.getByRole("dialog", { name: /Select Menu Items/ });
      await expect(dialog).toBeVisible();
      // The drawer shows one category at a time: open the dish's category on the rail, then pick the dish.
      for (const item of m.items) {
        await dialog.getByRole("navigation", { name: "Categories" }).getByRole("button", { name: new RegExp(`^${items.find((i) => i.name === item)!.cat}`) }).click();
        await dialog.getByRole("button", { name: new RegExp(item) }).first().click();
      }
      await dialog.getByRole("button", { name: "Save Items" }).click();
      await expect(dialog).not.toBeVisible();
    }

    await page.getByRole("tab", { name: "Order Details" }).click();
    await page.getByLabel("Venue / Building Name").fill(spec.venue);
    if (spec.address) await page.getByLabel("Complete Venue Address").fill(spec.address);
    if (spec.notes) await page.getByLabel("Additional Notes").fill(spec.notes);
    await page.getByRole("button", { name: "Save Order", exact: true }).click();
    await expect(page).toHaveURL(/\/orders$/, { timeout: 30_000 });
    const found = await pool.query<{ id: string }>(`SELECT o.id FROM "order" o JOIN customer c ON c.id = o."customerId" WHERE o."organizationId" = $1 AND c.name = $2 ORDER BY o."createdAt" DESC LIMIT 1`, [orgId, customerName]);
    return found.rows[0].id;
  };
  const veg = ["Paneer Tikka", "Dal Makhani", "Paneer Butter Masala", "Veg Biryani", "Butter Naan", "Gulab Jamun"];
  const nonveg = ["Chicken Tikka", "Fish Fry", "Butter Chicken", "Mutton Rogan Josh", "Chicken Biryani", "Butter Naan", "Rasmalai"];

  // A: a three-day wedding, the showcase order
  ids.A = await order(0, {
    event: "Wedding", start: 12, end: 14, venue: "The Grand Orchid, Whitefield", address: "Whitefield Main Road, Bengaluru", notes: "Haldi lunch on day one, reception dinner on day two, farewell lunch on day three.",
    adults: 380, kids5to10: 50, kidsBelow5: 20,
    meals: [
      { date: 12, meal: "Lunch", menu: MENU.classic, items: veg },
      { date: 13, meal: "Dinner", menu: MENU.royal, items: nonveg },
      { date: 14, meal: "Lunch", menu: MENU.classic, items: veg },
    ],
  });
  ids.B = await order(1, { event: "Corporate Lunch", start: 1, venue: "Embassy Tech Village, Bellandur", adults: 120, meals: [{ date: 1, meal: "Lunch", menu: MENU.lunch, items: ["Dal Makhani", "Paneer Butter Masala", "Veg Biryani", "Butter Naan"] }] });
  ids.C = await order(2, { event: "Birthday Party", start: 9, venue: "Lakeview Clubhouse, Indiranagar", adults: 40, kids5to10: 20, meals: [{ date: 9, meal: "Dinner", menu: MENU.classic, items: veg }] });
  ids.D = await order(3, { event: "Wedding", start: 21, end: 22, venue: "Palm Meadows Resort, Sarjapur", adults: 520, kids5to10: 80, meals: [{ date: 21, meal: "Dinner", menu: MENU.royal, items: nonveg }, { date: 22, meal: "Lunch", menu: MENU.royal, items: nonveg }] });
  ids.E = await order(4, { event: "Corporate Lunch", start: 5, venue: "Manyata Business Park", adults: 200, meals: [{ date: 5, meal: "Lunch", menu: MENU.lunch, items: ["Dal Makhani", "Veg Biryani", "Butter Naan", "Gulab Jamun"] }] });
  ids.F = await order(5, { event: "Birthday Party", start: 0, venue: "Sunrise Apartments Hall, Koramangala", adults: 80, meals: [{ date: 0, meal: "Lunch", menu: MENU.royal, items: ["Chicken Tikka", "Butter Chicken", "Chicken Biryani", "Butter Naan"] }] });
  ids.G = await order(6, { event: "Wedding", start: 2, venue: "Cubbon Park Pavilion", adults: 150, meals: [{ date: 2, meal: "Dinner", menu: MENU.classic, items: veg }] });
  ids.H = await order(7, { event: "Corporate Lunch", start: 1, venue: "Prestige Tech Park", adults: 95, meals: [{ date: 1, meal: "Lunch", menu: MENU.royal, items: ["Chicken Tikka", "Butter Chicken", "Chicken Biryani", "Rasmalai"] }] });

  // More bookings further out, so the calendar looks like a working month.
  ids.I = await order(0, { event: "Corporate Lunch", start: 8, venue: "Global Tech Park, Whitefield", adults: 140, meals: [{ date: 8, meal: "Lunch", menu: MENU.lunch, items: ["Dal Makhani", "Veg Biryani", "Butter Naan"] }] });
  ids.J = await order(2, { event: "Birthday Party", start: 16, venue: "Orchid Garden, Hebbal", adults: 70, kids5to10: 25, meals: [{ date: 16, meal: "Dinner", menu: MENU.classic, items: veg }] });
  ids.K = await order(3, { event: "Wedding", start: 19, end: 20, venue: "Windsor Manor Lawns", adults: 300, meals: [{ date: 19, meal: "Dinner", menu: MENU.royal, items: nonveg }, { date: 20, meal: "Lunch", menu: MENU.royal, items: nonveg }] });
  ids.L = await order(4, { event: "Corporate Lunch", start: 23, venue: "RMZ Ecospace, Bellandur", adults: 180, meals: [{ date: 23, meal: "Lunch", menu: MENU.lunch, items: ["Dal Makhani", "Veg Biryani", "Butter Naan", "Gulab Jamun"] }] });

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
