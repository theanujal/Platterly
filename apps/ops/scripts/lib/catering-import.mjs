// One-time import of catering's plans, subscriptions, paid plan payments and billing profile into ops
// (docs/ops-contract.md, step 6c). It READS catering and WRITES only ops:
//  - the catering connection is a read-only transaction, so a write there is refused by the database itself;
//  - catering's invoice sequence is read with SELECT (never nextval), so catering's numbering is not advanced.
// Safe to run again: every row has a deterministic id and is inserted only if missing, so a second run changes nothing and
// never overwrites what staff edited in ops since.
import { createHash } from "node:crypto";

/** The product the rows are imported for. The ops product row, its manifest and its businesses are looked up under this key. */
export const PRODUCT_KEY = "catering";

/** The plan limit columns that become entitlement keys (same names as catering's manifest), plus the multiLocation flag. */
export const LIMIT_COLUMNS = ["maxUsers", "maxEvents", "maxOrders", "maxKitchens", "maxStores", "maxCustomers", "maxMenuLinks", "maxStorageMb", "maxReports", "maxWhatsappMessages"];

/** Same source row, same id, every time: this is what makes a repeated import harmless. */
export const stableId = (prefix, sourceId) => `${prefix}_${createHash("sha256").update(`catering-import:${prefix}:${sourceId}`).digest("hex").slice(0, 32)}`;

const STATUS_MAP = { TRIALING: "TRIALING", ACTIVE: "ACTIVE", EXPIRED: "CANCELLED", CANCELLED: "CANCELLED" };

/** Reads everything needed from catering in one read-only, consistent snapshot. */
/** `profileId` is catering's billing-profile row (always "platform" in real use). */
export async function readSource(client, profileId = "platform") {
  await client.query("BEGIN READ ONLY ISOLATION LEVEL REPEATABLE READ");
  try {
    // One query at a time: a pg client runs one statement at once.
    const q = async (sql) => (await client.query(sql)).rows;
    const plans = await q('select * from subscription_plan order by "createdAt", id');
    const orgs = await q('select id, "businessId", name from organization');
    const subscriptions = await q('select * from subscription order by "startDate", id');
    const payments = await q('select * from subscription_payment order by "createdAt", id');
    const profiles = (await client.query("select * from platform_billing_profile where id = $1", [profileId])).rows;
    const sequence = await q("select last_value, is_called from subscription_invoice_seq");
    return { plans, orgs, subscriptions, payments, profile: profiles[0] ?? null, sequence: sequence[0] };
  } finally {
    await client.query("ROLLBACK");
  }
}

const num = (v) => (v === null || v === undefined ? null : Number(v));

export function planEntitlements(plan) {
  const values = {};
  for (const key of LIMIT_COLUMNS) values[key] = plan[key] ?? null;
  values.multiLocation = plan.multiLocation === true;
  return values;
}

/**
 * Turns the source rows into the rows to insert, and a report of what is left out and why.
 * `known` is the set of businessIds ops already has on this product; only those are imported (ops cannot hold a subscription
 * for a business it has never heard of). Anything inconsistent is returned in `errors`, and nothing is applied then.
 */
export function buildImport(source, known, manifestKeys) {
  const errors = [];
  const skipped = { subscriptionsUnknownBusiness: 0, paymentsUnknownBusiness: 0, paymentsNotPaid: 0, businessesUnknown: 0 };

  const planId = new Map(source.plans.map((p) => [p.id, stableId("plan", p.id)]));
  const plans = source.plans.map((p) => {
    const entitlements = planEntitlements(p);
    for (const key of Object.keys(entitlements)) if (!manifestKeys.has(key)) errors.push(`plan "${p.code}": "${key}" is not an entitlement the catering manifest declares`);
    return {
      id: planId.get(p.id), sourceId: p.id, code: p.code, name: p.name, description: p.description, isTrial: p.isTrial, trialDurationDays: p.trialDurationDays,
      priceMonthly: p.priceMonthly, priceAnnual: p.priceAnnual, currency: p.currency, gstPercent: p.gstPercent, highlights: p.highlights ?? [], entitlements,
      isActive: p.isActive, createdAt: p.createdAt, updatedAt: p.updatedAt,
    };
  });

  const businessOf = new Map(source.orgs.map((o) => [o.id, o.businessId]));
  const importedOrgs = new Set(source.orgs.filter((o) => known.has(o.businessId)).map((o) => o.id));
  skipped.businessesUnknown = source.orgs.length - importedOrgs.size;

  const subscriptions = [];
  for (const s of source.subscriptions) {
    if (!importedOrgs.has(s.organizationId)) {
      skipped.subscriptionsUnknownBusiness += 1;
      continue;
    }
    if (!planId.has(s.subscriptionPlanId)) errors.push(`subscription ${s.id}: its plan ${s.subscriptionPlanId} is missing`);
    if (!STATUS_MAP[s.status]) errors.push(`subscription ${s.id}: unknown status ${s.status}`);
    subscriptions.push({
      id: stableId("sub", s.id), sourceId: s.id, businessId: businessOf.get(s.organizationId), planId: planId.get(s.subscriptionPlanId), status: STATUS_MAP[s.status],
      startDate: s.startDate, trialEndsAt: s.trialEndsAt, endDate: s.endDate, billingInterval: s.billingInterval, currentPeriodEnd: s.currentPeriodEnd,
      pendingPlanId: s.pendingPlanId ? planId.get(s.pendingPlanId) ?? null : null, pendingInterval: s.pendingInterval, createdAt: s.createdAt, updatedAt: s.updatedAt,
    });
  }
  const currentPerBusiness = new Map();
  for (const s of subscriptions) if (s.endDate === null) currentPerBusiness.set(s.businessId, (currentPerBusiness.get(s.businessId) ?? 0) + 1);
  for (const [business, count] of currentPerBusiness) if (count > 1) errors.push(`business ${business} has ${count} current subscriptions in catering`);

  const payments = [];
  const invoiceNumbers = new Set();
  for (const p of source.payments) {
    if (!importedOrgs.has(p.organizationId)) {
      skipped.paymentsUnknownBusiness += 1;
      continue;
    }
    // Only money that was actually received is accounting. An abandoned or failed checkout is not carried over.
    if (p.status !== "PAID") {
      skipped.paymentsNotPaid += 1;
      continue;
    }
    if (!planId.has(p.subscriptionPlanId)) errors.push(`payment ${p.id}: its plan ${p.subscriptionPlanId} is missing`);
    if (!p.invoiceNumber) errors.push(`payment ${p.id} is PAID but has no invoice number`);
    if (p.invoiceNumber && invoiceNumbers.has(p.invoiceNumber)) errors.push(`invoice number ${p.invoiceNumber} appears twice`);
    invoiceNumbers.add(p.invoiceNumber);
    if (Math.abs(num(p.amount) + num(p.gstAmount) - num(p.total)) > 0.005) errors.push(`payment ${p.id}: amount + GST does not equal total`);
    payments.push({
      id: stableId("pay", p.id), sourceId: p.id, businessId: businessOf.get(p.organizationId), planId: planId.get(p.subscriptionPlanId), interval: p.interval,
      amount: p.amount, gstPercent: p.gstPercent, gstAmount: p.gstAmount, total: p.total, status: "PAID", razorpayOrderId: p.razorpayOrderId, razorpayPaymentId: p.razorpayPaymentId,
      invoiceNumber: p.invoiceNumber, periodStart: p.periodStart, periodEnd: p.periodEnd, paidAt: p.paidAt, invoiceSnapshot: p.invoiceSnapshot, importedFrom: `catering:${p.id}`, createdAt: p.createdAt,
    });
  }

  return { plans, subscriptions, payments, profile: source.profile, sequence: source.sequence, skipped, errors };
}

const PLAN_COLUMNS = 'id, "productKey", code, name, description, "isTrial", "trialDurationDays", "priceMonthly", "priceAnnual", currency, "gstPercent", highlights, entitlements, "isActive", "createdAt", "updatedAt"';

/** Inserts what is missing, inside the caller's transaction. Returns how many rows were new. */
export async function applyImport(client, built, productKey = PRODUCT_KEY) {
  const inserted = { plans: 0, subscriptions: 0, payments: 0, profile: 0 };
  const skippedExisting = { businessesAlreadyInOps: 0, plansAlreadyInOps: 0, profileAlreadyInOps: false };
  const plansInserted = new Set();

  for (const p of built.plans) {
    const r = await client.query(
      `insert into plan (${PLAN_COLUMNS}) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15, $16) on conflict ("productKey", code) do nothing`,
      [p.id, productKey, p.code, p.name, p.description, p.isTrial, p.trialDurationDays, p.priceMonthly, p.priceAnnual, p.currency, p.gstPercent, p.highlights, JSON.stringify(p.entitlements), p.isActive, p.createdAt, p.updatedAt],
    );
    inserted.plans += r.rowCount;
    if (r.rowCount) plansInserted.add(p.code);
    else skippedExisting.plansAlreadyInOps += 1;
  }
  // A plan that already existed in ops keeps its own id, so map the source plan to whatever id ops has for that code.
  const opsPlanByCode = new Map((await client.query('select id, code from plan where "productKey" = $1', [productKey])).rows.map((r) => [r.code, r.id]));
  const codeOfImportedPlan = new Map(built.plans.map((p) => [p.id, p.code]));
  const resolvePlan = (id) => (id ? opsPlanByCode.get(codeOfImportedPlan.get(id)) ?? id : id);

  // A business that already has any subscription in ops (staff assigned one, or a sign-up started a trial) is left alone.
  const existing = new Set((await client.query('select distinct "businessId" from subscription where "productKey" = $1', [productKey])).rows.map((r) => r.businessId));
  const importedBefore = new Set((await client.query("select id from subscription where id = any($1)", [built.subscriptions.map((s) => s.id)])).rows.map((r) => r.id));
  const skipBusinesses = new Set();
  for (const s of built.subscriptions) if (existing.has(s.businessId) && !importedBefore.has(s.id)) skipBusinesses.add(s.businessId);
  skippedExisting.businessesAlreadyInOps = skipBusinesses.size;

  for (const s of built.subscriptions) {
    if (skipBusinesses.has(s.businessId)) continue;
    const r = await client.query(
      `insert into subscription (id, "businessId", "productKey", "planId", status, "startDate", "trialEndsAt", "endDate", "billingInterval", "currentPeriodEnd", "pendingPlanId", "pendingInterval", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5::"SubscriptionStatus", $6, $7, $8, $9::"BillingInterval", $10, $11, $12::"BillingInterval", $13, $14) on conflict (id) do nothing`,
      [s.id, s.businessId, productKey, resolvePlan(s.planId), s.status, s.startDate, s.trialEndsAt, s.endDate, s.billingInterval, s.currentPeriodEnd, resolvePlan(s.pendingPlanId), s.pendingInterval, s.createdAt, s.updatedAt],
    );
    inserted.subscriptions += r.rowCount;
  }

  for (const p of built.payments) {
    const r = await client.query(
      `insert into subscription_payment (id, "businessId", "productKey", "planId", interval, amount, "gstPercent", "gstAmount", total, status, "razorpayOrderId", "razorpayPaymentId", "invoiceNumber", "periodStart", "periodEnd", "paidAt", "invoiceSnapshot", "importedFrom", "createdAt")
       values ($1, $2, $3, $4, $5::"BillingInterval", $6, $7, $8, $9, 'PAID', $10, $11, $12, $13, $14, $15, $16::jsonb, $17, $18) on conflict (id) do nothing`,
      [p.id, p.businessId, productKey, resolvePlan(p.planId), p.interval, p.amount, p.gstPercent, p.gstAmount, p.total, p.razorpayOrderId, p.razorpayPaymentId, p.invoiceNumber, p.periodStart, p.periodEnd, p.paidAt, p.invoiceSnapshot === null ? null : JSON.stringify(p.invoiceSnapshot), p.importedFrom, p.createdAt],
    );
    inserted.payments += r.rowCount;
  }

  if (built.profile) {
    const b = built.profile;
    const r = await client.query(
      `insert into platform_billing_profile (id, "legalName", "addressLine1", "addressLine2", city, state, "stateCode", "postalCode", country, gstin, pan, "sacCode", "invoicePrefix", email, phone, website, "invoiceNote", "updatedAt")
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) on conflict (id) do nothing`,
      [b.id, b.legalName, b.addressLine1, b.addressLine2, b.city, b.state, b.stateCode, b.postalCode, b.country, b.gstin, b.pan, b.sacCode, b.invoicePrefix, b.email, b.phone, b.website, b.invoiceNote, b.updatedAt],
    );
    inserted.profile += r.rowCount;
    if (!r.rowCount) skippedExisting.profileAlreadyInOps = true;
  }
  return { inserted, skippedExisting, skipBusinesses, plansInserted };
}

/** JSON with its keys sorted: Postgres jsonb does not keep key order, so two equal objects must compare equal either way. */
const canon = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
const money = (v) => (v === null || v === undefined ? null : Number(v).toFixed(2));
const day = (d) => (d ? new Date(d).toISOString() : null);

/**
 * Compares the source with what is now in ops (run inside the same transaction, before it is committed). Every imported row
 * is compared field by field, and the money is summed both ways. Any difference makes the whole import roll back.
 */
export async function reconcile(client, built, applied, productKey = PRODUCT_KEY) {
  const checks = [];
  const add = (name, expected, actual) => checks.push({ name, expected, actual, ok: JSON.stringify(expected) === JSON.stringify(actual) });

  const opsPlans = (await client.query('select code, name, "isTrial", "trialDurationDays", "priceMonthly", "priceAnnual", "gstPercent", highlights, entitlements, "isActive" from plan where "productKey" = $1', [productKey])).rows;
  const byCode = new Map(opsPlans.map((p) => [p.code, p]));
  // Only plans this run created are compared; a plan ops already had is left exactly as staff set it.
  let planDiffs = 0;
  for (const p of built.plans.filter((plan) => applied.plansInserted.has(plan.code))) {
    const o = byCode.get(p.code);
    const same = o && o.name === p.name && o.isTrial === p.isTrial && o.trialDurationDays === p.trialDurationDays && money(o.priceMonthly) === money(p.priceMonthly) && money(o.priceAnnual) === money(p.priceAnnual) && Number(o.gstPercent) === Number(p.gstPercent) && JSON.stringify(o.highlights) === JSON.stringify(p.highlights) && canon(o.entitlements) === canon(p.entitlements) && o.isActive === p.isActive;
    if (!same) planDiffs += 1;
  }
  add("plans: imported plans whose name, prices, GST or limits differ from catering (count)", 0, planDiffs);

  const subs = built.subscriptions.filter((s) => !applied.skipBusinesses.has(s.businessId));
  const rows = (await client.query('select id, "businessId", status, "startDate", "trialEndsAt", "endDate", "currentPeriodEnd", "billingInterval" from subscription where id = any($1)', [subs.map((s) => s.id)])).rows;
  add("subscriptions: rows present in ops (of those to import)", subs.length, rows.length);
  const opsSub = new Map(rows.map((r) => [r.id, r]));
  let subDiffs = 0;
  for (const s of subs) {
    const o = opsSub.get(s.id);
    if (!o || o.businessId !== s.businessId || o.status !== s.status || day(o.startDate) !== day(s.startDate) || day(o.trialEndsAt) !== day(s.trialEndsAt) || day(o.endDate) !== day(s.endDate) || day(o.currentPeriodEnd) !== day(s.currentPeriodEnd) || o.billingInterval !== s.billingInterval) subDiffs += 1;
  }
  add("subscriptions: rows whose dates, status and interval differ from catering", 0, subDiffs);
  const currentByBusiness = (await client.query('select "businessId", count(*)::int as n from subscription where "productKey" = $1 and "endDate" is null group by 1 having count(*) > 1', [productKey])).rows;
  add("subscriptions: businesses with more than one current subscription", 0, currentByBusiness.length);

  const pay = built.payments.filter((p) => !applied.skipBusinesses.has(p.businessId));
  const payRows = (await client.query('select id, "invoiceNumber", amount, "gstAmount", total, "paidAt", "invoiceSnapshot" is not null as has_snapshot from subscription_payment where id = any($1)', [pay.map((p) => p.id)])).rows;
  add("payments: paid rows present in ops", pay.length, payRows.length);
  const sum = (list, key) => list.reduce((t, r) => t + Math.round(Number(r[key]) * 100), 0) / 100;
  add("payments: total received (₹)", sum(pay, "total"), sum(payRows, "total"));
  add("payments: GST collected (₹)", sum(pay, "gstAmount"), sum(payRows, "gstAmount"));
  add("payments: amount before GST (₹)", sum(pay, "amount"), sum(payRows, "amount"));
  add("payments: invoice numbers (same set)", pay.map((p) => p.invoiceNumber).sort(), payRows.map((r) => r.invoiceNumber).sort());
  add("payments: rows without their frozen invoice snapshot", pay.filter((p) => p.invoiceSnapshot === null).length, payRows.filter((r) => !r.has_snapshot).length);

  // Like plans, an existing billing profile in ops is left as staff set it, so it is compared only when this run created it.
  if (built.profile && !applied.skippedExisting.profileAlreadyInOps) {
    const b = built.profile;
    const o = (await client.query("select * from platform_billing_profile where id = $1", [b.id])).rows[0];
    const keys = ["legalName", "addressLine1", "addressLine2", "city", "state", "stateCode", "postalCode", "country", "gstin", "pan", "sacCode", "invoicePrefix", "email", "phone", "website", "invoiceNote"];
    add("billing profile: fields that differ (count)", 0, o ? keys.filter((k) => (o[k] ?? null) !== (b[k] ?? null)).length : keys.length);
  }
  return { ok: checks.every((c) => c.ok), checks };
}

/** The highest invoice number issued so far (`last_value` counts only once the sequence has been used). */
const issued = (seq) => (seq.is_called ? Number(seq.last_value) : Number(seq.last_value) - 1);

/**
 * Raises the product's running invoice number in ops to the source's, so the next invoice ops issues for that product is
 * higher than every number already printed. It never moves backwards. Run AFTER the commit: a counter change is not rolled back
 * with the rows. (Numbering is per product; the old shared sequence is no longer used.)
 */
export async function syncSequence(client, sourceSeq, productKey = PRODUCT_KEY) {
  const row = (await client.query('select "lastNumber" from invoice_counter where "productKey" = $1', [productKey])).rows[0];
  const from = row ? row.lastNumber : 0;
  const to = Math.max(from, issued(sourceSeq));
  if (to > from || !row) {
    await client.query('insert into invoice_counter ("productKey", "lastNumber") values ($1, $2) on conflict ("productKey") do update set "lastNumber" = excluded."lastNumber"', [productKey, to]);
  }
  return { catering: issued(sourceSeq), opsBefore: from, opsAfter: to };
}

/** The full run. `dryRun` rolls everything back (the reconciliation still runs, on the uncommitted rows). */
export async function runImport({ source, target, dryRun, productKey = PRODUCT_KEY, profileId = "platform", log = () => {} }) {
  if (source === target) throw new Error("The source and the target are the same connection.");
  await source.query("set default_transaction_read_only = on");
  const product = (await target.query('select manifest from product where key = $1', [productKey])).rows[0];
  if (!product?.manifest) throw new Error(`Register the "${productKey}" product in ops and read its manifest first: the plan limits are checked against it.`);
  const manifestKeys = new Set(product.manifest.entitlements.map((e) => e.key));
  const known = new Set((await target.query('select "businessId" from business_product where "productKey" = $1', [productKey])).rows.map((r) => r.businessId));

  const data = await readSource(source, profileId);
  const built = buildImport(data, known, manifestKeys);
  log({ step: "read", plans: data.plans.length, subscriptions: data.subscriptions.length, payments: data.payments.length, organizations: data.orgs.length, knownToOps: known.size, skipped: built.skipped });
  if (built.errors.length) return { ok: false, errors: built.errors, built, committed: false };

  await target.query("begin");
  try {
    const applied = await applyImport(target, built, productKey);
    const rec = await reconcile(target, built, applied, productKey);
    if (!rec.ok || dryRun) {
      await target.query("rollback");
      return { ok: rec.ok, errors: [], built, applied, reconciliation: rec, committed: false, dryRun };
    }
    await target.query("commit");
    const sequence = await syncSequence(target, data.sequence, productKey);
    return { ok: true, errors: [], built, applied, reconciliation: rec, sequence, committed: true, dryRun: false };
  } catch (error) {
    await target.query("rollback").catch(() => undefined);
    throw error;
  }
}
