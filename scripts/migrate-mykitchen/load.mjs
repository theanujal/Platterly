// Step 2+3 of moving a client from mykitchen.platterly.in into Caterly: reads migration-data/mykitchen/ (written by
// extract.mjs), maps it onto Caterly's tables and loads it. Default is a DRY RUN: everything is written inside one
// transaction that is rolled back, and a report is printed. Add --apply to keep it.
//
//   node scripts/migrate-mykitchen/load.mjs            dry run (nothing kept)
//   node scripts/migrate-mykitchen/load.mjs --apply    load for real (back up the database first: npm run db:backup)
//
// Safe to run again: everything is matched by name / phone / order number before it is added, nothing is deleted, and no
// customer is notified (rows are written directly, never through notify()).
import "dotenv/config";
import pg from "pg";
import { randomUUID, randomBytes } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
// @ts-expect-error Node runs .ts files directly; tsc only objects to the extension in the path.
import { normalizePhone, isValidPhone } from "../../src/lib/phone.ts";

const APPLY = process.argv.includes("--apply");
const DATA = path.resolve("migration-data/mykitchen");
const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_ROOT?.trim() || path.join("public", "uploads"));
const PLAN_CODE = process.env.MIGRATE_PLAN_CODE || "premium";
const APP_ORIGIN = process.env.MIGRATE_APP_ORIGIN || "http://catering.localhost:3000";
const read = async (name) => JSON.parse(await readFile(path.join(DATA, "json", `${name}.json`), "utf8"));

const biz = (await read("business"))[0];
const menus = await read("menus");
const categories = await read("categories");
const items = await read("menu-items");
const addOns = await read("add-ons");
const customers = await read("customers");
const orders = await read("orders");
const eventTypes = await read("event-types");

const report = { notes: [], counts: {} };
const note = (text) => report.notes.push(text);
const count = (key, n = 1) => (report.counts[key] = (report.counts[key] ?? 0) + n);
const clean = (s) => (typeof s === "string" ? s.trim().replace(/\s+/g, " ") : s);
const textOrNull = (s) => (typeof s === "string" && s.trim() ? s.trim() : null);
const money = (s) => (s === null || s === undefined || s === "" ? null : Number(s));
const foodType = (t) => (t === "non-veg" ? "NON_VEGETARIAN" : "VEGETARIAN");
const dayUtc = (s) => new Date(`${String(s).slice(0, 10)}T00:00:00.000Z`);
const copyJobs = [];

/** Queues a picture to copy into the storage folder and returns the URL the app will serve it from. */
function picture(orgId, kind, oldUrl) {
  if (!oldUrl) return null;
  const ext = path.extname(oldUrl).toLowerCase() || ".jpg";
  const key = `organizations/${orgId}/catalog/${kind}/${randomUUID()}${ext}`;
  copyJobs.push({ from: path.join(DATA, "images", new URL(oldUrl, "https://x").pathname), to: path.join(UPLOAD_ROOT, key) });
  return `/uploads/${key}`;
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL?.split("?")[0] });
const db = await pool.connect();

/** The owner signs up through the app's own sign-up API (same hooks as a real sign-up), then is marked verified. */
async function ensureOwner() {
  const email = biz.contact_email.toLowerCase();
  let user = (await db.query(`select id from "user" where lower(email) = $1`, [email])).rows[0];
  if (!user && APPLY) {
    const password = randomBytes(18).toString("base64url") + "aA1!";
    const res = await fetch(`${APP_ORIGIN}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: APP_ORIGIN },
      body: JSON.stringify({ email, password, name: "Sudhir Bhandary", firstName: "Sudhir", lastName: "Bhandary", phone: normalizePhone(biz.contact_phone) }),
    });
    if (!res.ok) throw new Error(`Sign-up of the owner failed (${res.status}): ${await res.text()}`);
    user = (await db.query(`select id from "user" where lower(email) = $1`, [email])).rows[0];
    await db.query(`update "user" set "emailVerified" = true where id = $1`, [user.id]);
  }
  return user ?? null;
}

async function main() {
  const owner = await ensureOwner();
  await db.query("begin");
  try {
    // --- the kitchen account -------------------------------------------------------------------------------------
    let org;
    if (owner) {
      org = (await db.query(`select o.* from organization o join member m on m."organizationId" = o.id where m."userId" = $1 and m.role = 'owner' limit 1`, [owner.id])).rows[0];
    }
    if (!org) {
      // Dry run before any sign-up: a throwaway organization inside the transaction stands in for the real one.
      const id = randomUUID();
      await db.query(`insert into organization (id, name, slug, "createdAt") values ($1, 'Unnamed Business', $2, now())`, [id, `dry-${id.slice(0, 8)}`]);
      org = (await db.query(`select * from organization where id = $1`, [id])).rows[0];
    }
    const orgId = org.id;
    const slugTaken = (await db.query(`select 1 from organization where slug = $1 and id <> $2`, [biz.business_url_slug, orgId])).rowCount > 0;
    if (slugTaken) throw new Error(`The link "${biz.business_url_slug}" already belongs to another business.`);
    const logo = org.logo ?? picture(orgId, "logo", biz.logo_url);
    await db.query(
      `update organization set name = $2, slug = $3, logo = coalesce(logo, $4), status = 'ACTIVE', "ownerFirstName" = 'Sudhir', "ownerLastName" = 'Bhandary',
         "contactPhone" = $5, "contactEmail" = $6, "gstNumber" = $7, "addressLine1" = $8, city = $9, state = $10, "postalCode" = $11, country = 'India',
         "slugChangeCount" = greatest("slugChangeCount", 1), "businessDescription" = $12, "websiteUrl" = $13, "instagramUrl" = $14, "facebookUrl" = $15,
         "gstShowOnInvoices" = $16, "onboardingCompletedAt" = coalesce("onboardingCompletedAt", now()) where id = $1`,
      [orgId, clean(biz.business_name), biz.business_url_slug, logo, normalizePhone(biz.contact_phone), biz.contact_email, textOrNull(biz.gst_number), textOrNull(biz.address)?.replace(/,\s*$/, ""), clean(biz.city), clean(biz.state), textOrNull(biz.zip), textOrNull(biz.about_text), textOrNull(biz.website), textOrNull(biz.instagram), textOrNull(biz.facebook), !!biz.show_gst_on_invoices],
    );
    count("business updated");
    note(`GST percentage in the old app is ${biz.gst_percentage}; Caterly's default GST rate (Settings -> Payments) was not changed.`);

    // --- paid plan (no payment collected, no end date) ------------------------------------------------------------
    const plan = (await db.query(`select id, name from subscription_plan where code = $1`, [PLAN_CODE])).rows[0];
    if (!plan) throw new Error(`No plan with code "${PLAN_CODE}".`);
    const current = (await db.query(`select s.id, s."subscriptionPlanId", p."isTrial" from subscription s join subscription_plan p on p.id = s."subscriptionPlanId" where s."organizationId" = $1 and s."endDate" is null`, [orgId])).rows;
    if (current.length === 1 && current[0].subscriptionPlanId === plan.id) {
      note(`Already on the ${plan.name} plan.`);
    } else {
      await db.query(`update subscription set status = 'CANCELLED', "endDate" = now(), "updatedAt" = now() where "organizationId" = $1 and "endDate" is null`, [orgId]);
      await db.query(`insert into subscription (id, "organizationId", "subscriptionPlanId", status, "startDate", "billingInterval", "updatedAt") values ($1, $2, $3, 'ACTIVE', now(), 'MONTHLY', now())`, [randomUUID(), orgId, plan.id]);
      count("plan set");
      note(`Put on the ${plan.name} plan as an active paid plan with no payment taken and no end date. When Ops billing is live, record his first payment there.`);
    }

    // --- categories ----------------------------------------------------------------------------------------------
    const categoryId = new Map(); // old id -> new id
    for (const c of categories) {
      const name = clean(c.name);
      let id = (await db.query(`select id from menu_category where "organizationId" = $1 and name = $2`, [orgId, name])).rows[0]?.id;
      if (!id) {
        id = randomUUID();
        await db.query(`insert into menu_category (id, "organizationId", name, description, "isActive", "updatedAt") values ($1, $2, $3, $4, true, now())`, [id, orgId, name, textOrNull(c.description)]);
        count("categories");
      }
      categoryId.set(c.id, id);
    }

    // --- menus ---------------------------------------------------------------------------------------------------
    const menuId = new Map();
    for (const [index, m] of menus.entries()) {
      const name = clean(m.name);
      let id = (await db.query(`select id from menu where "organizationId" = $1 and name = $2`, [orgId, name])).rows[0]?.id;
      if (!id) {
        id = randomUUID();
        const kids = money(m.kids_5_10_price_per_plate);
        const small = money(m.kids_0_5_price_per_plate);
        await db.query(
          `insert into menu (id, "organizationId", name, description, image, "menuType", "pricePerPlate", "isActive", "sortOrder", "childUnder5Chargeable", "childUnder5Price", "child5To10PricingType", "child5To10PriceValue", "updatedAt")
           values ($1, $2, $3, $4, $5, $6::"FoodType", $7, $8, $9, $10, $11, 'FIXED', $12, now())`,
          [id, orgId, name, textOrNull(m.description), picture(orgId, "menus", m.image_url), foodType(m.menu_type), money(m.price_per_plate) ?? 0, m.is_active, index, small !== null, small, kids],
        );
        count("menus");
      }
      menuId.set(m.id, id);
    }

    // --- category <-> menu (max selection) ----------------------------------------------------------------------
    for (const c of categories) {
      for (const s of c.menu_settings ?? []) {
        if (!menuId.has(s.menu_id)) { note(`Category "${c.name}" points at a menu that no longer exists (${s.menu_name}); skipped.`); continue; }
        const done = await db.query(
          `insert into menu_category_assignment (id, "menuId", "categoryId", "maxSelection", "sortOrder") values ($1, $2, $3, $4, $5) on conflict ("menuId", "categoryId") do nothing`,
          [randomUUID(), menuId.get(s.menu_id), categoryId.get(c.id), s.max_selection ?? null, c.display_order ?? 0],
        );
        count("category-menu links", done.rowCount);
      }
    }

    // --- food items (same name in several categories/menus becomes ONE item with all of them) -------------------
    const groups = new Map();
    for (const it of items) {
      const key = clean(it.name).toLowerCase();
      groups.set(key, [...(groups.get(key) ?? []), it]);
    }
    const itemId = new Map(); // old id -> new id
    let merged = 0;
    for (const group of groups.values()) {
      const first = group.find((g) => g.image_url) ?? group[0];
      const name = clean(first.name);
      let id = (await db.query(`select id from menu_item where "organizationId" = $1 and lower(name) = lower($2)`, [orgId, name])).rows[0]?.id;
      if (!id) {
        id = randomUUID();
        const types = new Set(group.map((g) => g.menu_type));
        const both = types.has("both") || (types.has("veg") && types.has("non-veg"));
        const prices = new Set(group.map((g) => money(g.price_per_plate)));
        if (prices.size > 1) note(`"${name}" has different prices in the old app (${[...prices].join(", ")}); kept ${money(first.price_per_plate)}.`);
        await db.query(
          `insert into menu_item (id, "organizationId", name, description, image, "foodType", price, "isActive", "vegFriendly", "nonVegFriendly", "imageSource", "updatedAt")
           values ($1, $2, $3, $4, $5, $6::"FoodType", $7, $8, $9, $10, $11, now())`,
          [id, orgId, name, textOrNull(first.description), picture(orgId, "items", first.image_url), foodType(types.has("non-veg") && !both ? "non-veg" : "veg"), money(first.price_per_plate) ?? 0, group.some((g) => g.is_active), both ? true : null, both ? true : null, first.image_url ? "upload" : null],
        );
        count("food items");
      }
      if (group.length > 1) merged += group.length - 1;
      for (const g of group) {
        itemId.set(g.id, id);
        const cat = categoryId.get(g.category_id);
        if (cat) count("item-category links", (await db.query(`insert into menu_item_category (id, "menuItemId", "categoryId") values ($1, $2, $3) on conflict ("menuItemId", "categoryId") do nothing`, [randomUUID(), id, cat])).rowCount);
        for (const [i, mid] of (g.menu_ids ?? []).entries()) {
          if (!menuId.has(mid)) continue;
          count("item-menu links", (await db.query(`insert into menu_menu_item (id, "menuId", "menuItemId", "sortOrder") values ($1, $2, $3, $4) on conflict ("menuId", "menuItemId") do nothing`, [randomUUID(), menuId.get(mid), id, i])).rowCount);
        }
      }
      if (group.some((g) => g.menu_type === "both") || new Set(group.map((g) => g.menu_type)).size > 1) count("items marked suits veg and non-veg");
    }
    if (merged) note(`${merged} repeated food item rows (same name in several categories) were merged into single items that belong to all those categories and menus, because Caterly keeps one food item per name.`);
    const noMenu = items.filter((i) => !(i.menu_ids ?? []).length).length;
    if (noMenu) note(`${noMenu} food item(s) belong to no menu in the old app.`);

    // --- add-ons -------------------------------------------------------------------------------------------------
    const addOnId = new Map();
    for (const a of addOns) {
      const name = clean(a.name);
      let id = (await db.query(`select id from add_on where "organizationId" = $1 and name = $2`, [orgId, name])).rows[0]?.id;
      if (!id) {
        id = randomUUID();
        await db.query(
          `insert into add_on (id, "organizationId", name, description, image, type, "priceType", price, "isActive", "updatedAt") values ($1, $2, $3, $4, $5, $6::"AddOnType", $7::"AddOnPriceType", $8, true, now())`,
          [id, orgId, name, textOrNull(a.description), picture(orgId, "add-ons", a.image_url), /counter/i.test(a.name) ? "LIVE_COUNTER" : "SPECIAL_ADD_ON", a.pricing_type === "fixed" ? "FIXED" : "PER_PLATE", money(a.price) ?? 0],
        );
        count("add-ons");
      }
      addOnId.set(a.id, id);
    }

    // --- event types ---------------------------------------------------------------------------------------------
    const eventTypeId = new Map();
    for (const [index, e] of eventTypes.entries()) {
      const name = clean(e.name);
      let id = (await db.query(`select id from event_type where "organizationId" = $1 and name = $2`, [orgId, name])).rows[0]?.id;
      if (!id) {
        id = randomUUID();
        await db.query(
          `insert into event_type (id, "organizationId", name, description, image, "minGuests", "isActive", "sortOrder", "updatedAt") values ($1, $2, $3, $4, $5, $6, true, $7, now())`,
          [id, orgId, name, textOrNull(e.description), picture(orgId, "event-types", e.image_url), e.number_of_guests > 0 ? e.number_of_guests : null, index],
        );
        count("event types");
      }
      eventTypeId.set(e.id, id);
      for (const mid of e.menu_ids ?? []) {
        if (menuId.has(mid)) count("event type-menu links", (await db.query(`insert into event_type_menu (id, "eventTypeId", "menuId") values ($1, $2, $3) on conflict ("eventTypeId", "menuId") do nothing`, [randomUUID(), id, menuId.get(mid)])).rowCount);
      }
    }
    if (!eventTypes.some((e) => (e.menu_ids ?? []).length)) note("No event type is linked to any menu in the old app, so none are linked here.");

    // --- customers -----------------------------------------------------------------------------------------------
    const customerByPhone = new Map();
    async function customerFor(name, phoneRaw, email, extra) {
      const phone = normalizePhone(phoneRaw);
      if (customerByPhone.has(phone)) return customerByPhone.get(phone);
      let id = (await db.query(`select id from customer where "organizationId" = $1 and phone = $2`, [orgId, phone])).rows[0]?.id;
      if (!id) {
        id = randomUUID();
        if (!isValidPhone(phone)) note(`Customer "${clean(name)}" has a phone number that is not a valid number (${phoneRaw}); kept as given (${phone}).`);
        await db.query(
          `insert into customer (id, "organizationId", name, phone, email, notes, "isEnquiry", "leadSource", "updatedAt") values ($1, $2, $3, $4, $5, $6, $7, $8::"EnquiryLeadSource", now())`,
          [id, orgId, clean(name), phone, textOrNull(email), extra.notes ?? null, extra.isEnquiry, extra.isEnquiry ? "STOREFRONT" : null],
        );
        count("customers");
      }
      customerByPhone.set(phone, id);
      return id;
    }
    for (const c of customers) await customerFor(c.name, c.phone, c.email, { isEnquiry: !!c.is_lead, notes: textOrNull(c.notes) });

    // --- orders (all of them, as they were; the old app had no payment records) ---------------------------------
    const STATUS = { pending: "PENDING_REVIEW", menu_sent: "AWAITING_CUSTOMER_APPROVAL", rejected: "CANCELLED", completed: "COMPLETED" };
    const EVENT_STATUS = { PENDING_REVIEW: "PENDING", AWAITING_CUSTOMER_APPROVAL: "PENDING", CANCELLED: "CANCELLED", COMPLETED: "COMPLETED" };
    const MEAL = { breakfast: "BREAKFAST", lunch: "LUNCH", dinner: "DINNER", "hi-tea": "HITEA", hitea: "HITEA" };
    const VENUE = { hotel: "HOTEL", clubhouse: "CLUBHOUSE", "banquet hall": "BANQUET_HALL", resort: "RESORT", home: "HOME", office: "OFFICE" };
    for (const o of [...orders].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      if (!o.order_number) {
        o.order_number = `MK-${o.id.slice(0, 8).toUpperCase()}`;
        note(`An order from ${o.customer_name} (event ${o.event_date}) had no order number in the old app; numbered ${o.order_number}.`);
      }
      const exists = (await db.query(`select 1 from "order" where "organizationId" = $1 and "orderNumber" = $2`, [orgId, o.order_number])).rowCount > 0;
      if (exists) continue;
      const customer = await customerFor(o.customer_name, o.customer_phone, o.customer_email, { isEnquiry: true });
      const status = STATUS[o.status] ?? "PENDING_REVIEW";
      if (!STATUS[o.status]) note(`Order ${o.order_number} has an unknown status "${o.status}"; set to Pending Review.`);
      const date = dayUtc(o.event_date);
      const total = money(o.total_cost) ?? 0;
      const transport = money(o.transportation_cost) ?? 0;
      const discount = money(o.discount) ?? 0;
      const other = money(o.extra_charge) ?? 0;
      const adults = o.number_of_guests ?? 0;
      const kids05 = o.kids_0_5 ?? 0;
      const kids510 = o.kids_5_10 ?? 0;
      const meal = MEAL[String(o.event_time ?? "").toLowerCase()] ?? "OTHER";
      const notes = [textOrNull(o.admin_notes), `Moved from the old Platterly app (order ${o.order_number}, status "${o.status}"${o.booking_completed ? "" : ", booking form was not completed"}).`].filter(Boolean).join("\n\n");
      const orderId = randomUUID();
      await db.query(
        `insert into "order" (id, "organizationId", "customerId", "eventTypeId", "orderNumber", "eventStartDate", "eventEndDate", venue, "eventAddress", "menuPreference", "eventMealType",
           "venueType", "venueDoorNumber", "venueTower", "venueFloor", "venueHallName", "venueLandmark", "venueContactName", "venueContactPhone",
           "adultCount", "childBelow5Count", "child5To10Count", "totalParticipants", subtotal, "transportationCost", "otherCharges", discount, total, balance,
           "paymentStatus", status, notes, "createdAt", "updatedAt")
         values ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9::"FoodType",$10::"MealType",$11::"VenueType",$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$27,'UNPAID',$28::"OrderStatus",$29,$30,$31)`,
        [orderId, orgId, customer, eventTypeId.get(o.event_type) ?? null, o.order_number, date, textOrNull(o.venue_building_name), textOrNull(o.complete_venue_address ?? o.venue_location), foodType(o.menu_type), meal,
          VENUE[String(o.venue_type ?? "").toLowerCase()] ?? (o.venue_type ? "OTHER" : null), textOrNull(o.door_flat_house_no), textOrNull(o.tower_block), textOrNull(o.floor), textOrNull(o.function_area_hall_name), textOrNull(o.landmark), textOrNull(o.venue_contact_person), textOrNull(o.venue_contact_number),
          adults, kids05, kids510, adults + kids05 + kids510, total - transport + discount - other, transport, other, discount, total, status, notes, new Date(o.created_at), new Date(o.updated_at)],
      );
      count("orders");
      if (!eventTypeId.get(o.event_type)) note(`Order ${o.order_number} has no event type in the old app; no Event record was created for it.`);
      else {
        await db.query(
          `insert into event (id, "organizationId", "customerId", "eventTypeId", name, "startDate", "endDate", venue, "guestCount", status, "orderId", "createdAt", "updatedAt") values ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9::"EventStatus",$10,$11,$12)`,
          [randomUUID(), orgId, customer, eventTypeId.get(o.event_type), `${clean(o.customer_name)} · ${eventTypes.find((e) => e.id === o.event_type)?.name.trim() ?? "Event"}`, date, textOrNull(o.venue_building_name), adults + kids05 + kids510, EVENT_STATUS[status], orderId, new Date(o.created_at), new Date(o.updated_at)],
        );
        count("events");
      }
      if (o.menu_id && menuId.has(o.menu_id)) {
        const entryId = randomUUID();
        await db.query(`insert into meal_plan_entry (id, "orderId", date, "mealType", price, "menuId") values ($1,$2,$3,$4::"MealType",$5,$6)`, [entryId, orderId, date, meal, money(o.price_per_plate), menuId.get(o.menu_id)]);
        for (const it of o.selected_menu_items ?? []) {
          await db.query(`insert into order_item (id, "orderId", "itemType", "menuItemId", "mealPlanEntryId", name, "unitPrice", quantity, "isExtra") values ($1,$2,'MENU_ITEM',$3,$4,$5,$6,$7,$8)`,
            [randomUUID(), orderId, itemId.get(it.id) ?? null, entryId, clean(it.name), money(it.price_per_plate) ?? 0, it.quantity ?? 1, !!it.isExtra]);
          count("order lines");
        }
        for (const ad of o.selected_addons ?? []) {
          await db.query(`insert into order_item (id, "orderId", "itemType", "addOnId", "mealPlanEntryId", name, "unitPrice", quantity) values ($1,$2,'ADD_ON',$3,$4,$5,$6,1)`,
            [randomUUID(), orderId, addOnId.get(ad.id) ?? null, entryId, clean(ad.name), money(ad.price) ?? 0]);
          count("order lines");
        }
      }
      if (total > 1_000_000) note(`Order ${o.order_number} has a total of ${total.toLocaleString("en-IN")}; this looks like a test entry in the old app. Imported as is.`);
      if (!o.total_cost) count("orders without a price");
    }
    note(`Old order numbers are kept as written (for example ${orders.find((x) => x.order_number)?.order_number}). New orders continue Caterly's own series (${org.orderNumberPrefix}-${String(org.orderNumberNextValue).padStart(org.orderNumberPadding, "0")} next).`);
    note("The old app has no payment records, so no payments, invoices or receipts exist to move; every imported order is Unpaid.");

    if (APPLY) {
      await db.query("commit");
      for (const job of copyJobs) {
        await mkdir(path.dirname(job.to), { recursive: true });
        await copyFile(job.from, job.to);
      }
      await mkdir("migration-data", { recursive: true });
      await writeFile("migration-data/last-load.json", JSON.stringify({ organizationId: orgId, at: new Date().toISOString(), counts: report.counts }, null, 1));
    } else {
      await db.query("rollback");
    }
    console.log(`\n${APPLY ? "LOADED" : "DRY RUN (rolled back, nothing kept)"} for "${biz.business_name}" (${biz.business_url_slug})\n`);
    console.table(report.counts);
    console.log(`pictures to copy: ${copyJobs.length}`);
    for (const n of report.notes) console.log("- " + n);
  } catch (error) {
    await db.query("rollback").catch(() => {});
    throw error;
  }
}

try {
  await main();
} finally {
  db.release();
  await pool.end();
}
