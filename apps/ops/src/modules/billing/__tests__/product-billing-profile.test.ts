import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { setOrderCounter, createProfileFromPayment, getProductBillingEmail, getProductBuyer, productBillingProfileHistory, copyProductBillingProfile, getProductBillingProfile, listProductBillingProfiles, saveProductBillingProfile } from "../product-billing-profile";

const BIZ = `biz_${"c".repeat(32)}`;
const base = { name: "Spice Route Caterers", brandName: "Spice Route", contactEmail: "bill@example.com", city: "Pune", gstin: "27AAPFU0939F1ZV", website: "https://spice.example", logoUrl: "https://caterly.example/logo.png" };
const save = (productKey: string, fields: Parameters<typeof saveProductBillingProfile>[0]["fields"], baseVersion: number | null, source: "account" | "product" = "account") =>
  saveProductBillingProfile({ businessId: BIZ, productKey, fields, baseVersion, source });

const wipe = async () => {
  await prisma.auditLog.deleteMany({ where: { subject: BIZ, action: "billing.profile_saved" } });
  await prisma.business.deleteMany({ where: { id: BIZ } });
};
beforeEach(async () => { await wipe(); await prisma.business.create({ data: { id: BIZ, name: "Spice Route" } }); });
afterEach(wipe);

describe("product billing profiles", () => {
  it("creates a profile at version 1 and keeps products apart", async () => {
    const a = await save("caterly", base, null);
    expect(a.ok && a.profile.version).toBe(1);
    await save("rivo", { ...base, city: "Delhi" }, null);
    expect((await getProductBillingProfile(BIZ, "caterly"))!.city).toBe("Pune");
    expect((await listProductBillingProfiles(BIZ)).map((p) => p.productKey)).toEqual(["caterly", "rivo"]);
  });

  it("bumps the version on a change, and leaves it alone when nothing changed", async () => {
    await save("caterly", base, null);
    const same = await save("caterly", base, 1);
    expect(same.ok && same.profile.version).toBe(1);
    const next = await save("caterly", { ...base, city: "Mumbai" }, 1, "product");
    expect(next.ok && next.profile.version).toBe(2);
    expect(next.ok && next.profile.source).toBe("product");
  });

  it("refuses a stale save and returns the current record", async () => {
    await save("caterly", base, null);
    await save("caterly", { ...base, city: "Mumbai" }, 1);
    const stale = await save("caterly", { ...base, city: "Chennai" }, 1);
    expect(stale.ok).toBe(false);
    expect(!stale.ok && stale.reason === "conflict" && stale.current?.city).toBe("Mumbai");
    expect((await getProductBillingProfile(BIZ, "caterly"))!.city).toBe("Mumbai");
  });

  it("refuses a first save when a profile already exists, and a versioned save when none does", async () => {
    await save("caterly", base, null);
    expect((await save("caterly", base, null)).ok).toBe(true); // identical values: not a conflict
    const different = await save("caterly", { ...base, city: "Goa" }, null);
    expect(!different.ok && different.reason).toBe("conflict");
    const none = await save("rivo", base, 3);
    expect(!none.ok && none.reason === "conflict" && none.current).toBeNull();
  });

  it("writes an audit row with old and new values, and none for a no-op", async () => {
    await save("caterly", base, null);
    await save("caterly", base, 1);
    await save("caterly", { ...base, gstin: "29ABCDE1234F1Z5" }, 1);
    const rows = await prisma.auditLog.findMany({ where: { subject: BIZ, action: "billing.profile_saved" }, orderBy: { createdAt: "asc" } });
    expect(rows).toHaveLength(2);
    expect((rows[1].detail as { changes: Record<string, unknown> }).changes.gstin).toEqual({ from: "27AAPFU0939F1ZV", to: "29ABCDE1234F1Z5" });
  });

  it("lists the changes newest first with who, where and what changed", async () => {
    await saveProductBillingProfile({ businessId: BIZ, productKey: "caterly", fields: base, baseVersion: null, source: "account", editedBy: "u1" });
    await save("caterly", { ...base, city: "Mumbai" }, 1, "product");
    await save("rivo", base, null);
    const h = await productBillingProfileHistory(BIZ, "caterly");
    expect(h).toHaveLength(2);
    expect(h[0]).toMatchObject({ version: 2, source: "product", editedBy: null, created: false, changes: [{ field: "city", from: "Pune", to: "Mumbai" }] });
    expect(h[1]).toMatchObject({ version: 1, source: "account", editedBy: "u1", created: true, changes: [] });
  });

  it("copies one product's profile into another as a one-time copy", async () => {
    await save("caterly", base, null);
    const c = await copyProductBillingProfile({ businessId: BIZ, fromProductKey: "caterly", toProductKey: "rivo", baseVersion: null, source: "account" });
    expect(c.ok && c.profile.brandName).toBe("Spice Route");
    await save("caterly", { ...base, city: "Mumbai" }, 1);
    expect((await getProductBillingProfile(BIZ, "rivo"))!.city).toBe("Pune");
    expect((await copyProductBillingProfile({ businessId: BIZ, fromProductKey: "none", toProductKey: "rivo", baseVersion: 1, source: "account" })).ok).toBe(false);
  });

  it("creates a profile from a first payment only when the product has none, and reads the buyer and billing email back", async () => {
    const buyer = { name: "Paid Name", addressLine1: "1 Main Rd", addressLine2: null, city: "Pune", state: "Maharashtra", postalCode: "411001", country: "India", gstin: null, contactEmail: "pay@example.com" };
    expect(await getProductBuyer(BIZ, "caterly")).toBeNull();
    await createProfileFromPayment(BIZ, "caterly", buyer);
    expect(await getProductBuyer(BIZ, "caterly")).toMatchObject({ name: "Paid Name", city: "Pune", contactEmail: "pay@example.com" });
    expect(await getProductBillingEmail(BIZ, "caterly")).toBe("pay@example.com");
    expect(await getProductBillingEmail(BIZ, "rivo")).toBeNull();
    // A later payment never overwrites what the Account or the product saved.
    await createProfileFromPayment(BIZ, "caterly", { ...buyer, name: "Typed At Checkout" });
    expect((await getProductBuyer(BIZ, "caterly"))!.name).toBe("Paid Name");
  });

  it("reports an unknown business", async () => {
    const r = await saveProductBillingProfile({ businessId: "biz_missing", productKey: "caterly", fields: base, baseVersion: null, source: "account" });
    expect(!r.ok && r.reason).toBe("not_found");
  });

  it("a product the business uses with no profile yet starts as a copy of the latest one, without order numbering, so details are never typed twice", async () => {
    await prisma.businessProduct.createMany({ data: [{ businessId: BIZ, productKey: "catering" }, { businessId: BIZ, productKey: "impt" }] });
    await save("catering", { ...base, businessPhone: "+919800000123", orderNumberPrefix: "SR", orderNumberNextValue: "42", orderNumberPadding: "4" }, null);
    const list = await listProductBillingProfiles(BIZ);
    const copy = list.find((p) => p.productKey === "impt")!;
    expect(copy).toMatchObject({ name: base.name, brandName: "Spice Route", city: "Pune", businessPhone: "+919800000123", source: "copy", version: 1, orderNumberPrefix: null, orderNumberNextValue: null, orderNumberPadding: null });
    expect(list.find((p) => p.productKey === "catering")).toMatchObject({ orderNumberPrefix: "SR", orderNumberNextValue: "42", source: "account" });
    // Reading again changes nothing.
    expect((await listProductBillingProfiles(BIZ)).find((p) => p.productKey === "impt")!.version).toBe(1);
  });

  it("copying one product's profile to another leaves order numbering out", async () => {
    await save("caterly", { ...base, orderNumberPrefix: "SR", orderNumberNextValue: "42", orderNumberPadding: "4" }, null);
    const copied = await copyProductBillingProfile({ businessId: BIZ, fromProductKey: "caterly", toProductKey: "rivo", baseVersion: null, source: "account" });
    expect(copied.ok && copied.profile).toMatchObject({ city: "Pune", orderNumberPrefix: null, orderNumberNextValue: null });
  });

  it("the product's live order counter moves the next number without a new version, and seeds numbering once", async () => {
    await save("catering", base, null);
    expect(await setOrderCounter(BIZ, "catering", { orderNumberNextValue: "5", orderNumberPrefix: "SR", orderNumberPadding: "4" })).toBe(true);
    expect(await getProductBillingProfile(BIZ, "catering")).toMatchObject({ orderNumberPrefix: "SR", orderNumberNextValue: "5", orderNumberPadding: "4", version: 1 });
    // A later report only moves the counter; it never overwrites the prefix an edit set.
    await save("catering", { ...base, orderNumberPrefix: "AB", orderNumberNextValue: "5", orderNumberPadding: "4" }, 1);
    expect(await setOrderCounter(BIZ, "catering", { orderNumberNextValue: "9", orderNumberPrefix: "SR", orderNumberPadding: "4" })).toBe(true);
    expect(await getProductBillingProfile(BIZ, "catering")).toMatchObject({ orderNumberPrefix: "AB", orderNumberNextValue: "9", version: 2 });
    expect(await setOrderCounter(BIZ, "rivo", { orderNumberNextValue: "3" })).toBe(false);
  });
});
