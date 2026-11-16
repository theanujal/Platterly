import { expect, type Page } from "@playwright/test";

/**
 * Shared by the store-live*.spec.ts files. The Store no longer asks for billing details: an invoice goes to the product's saved billing profile, which lives
 * in Ops (one per business and product) and is edited in the Account. So a live spec first puts a COMPLETE profile for Bhandarys Kitchen's Caterly into the
 * throwaway Ops copy (the same record the Account's Billing Profile card saves), and the checkout then only shows it.
 */
export const BHANDARYS_PRODUCT_KEY = "catering";

/** Writes (or restores) the complete profile the checkout needs. `ops` is the spec's own throwaway-guarded psql helper. */
export function seedBillingProfile(ops: (statement: string) => string, businessId: string) {
  ops(
    `insert into product_billing_profile ("businessId","productKey",version,name,"contactName","contactEmail","contactPhone","addressLine1",city,state,"postalCode",country,source,"updatedAt") ` +
      `values ('${businessId}','${BHANDARYS_PRODUCT_KEY}',1,'Bhandarys Kitchen','Asha Bhandary','accounts@bhandarys.example','+919876543210','12 MG Road','Pune','Maharashtra','411001','India','account',now()) ` +
      `on conflict ("businessId","productKey") do update set version=1,name=excluded.name,"contactName"=excluded."contactName","contactEmail"=excluded."contactEmail","contactPhone"=excluded."contactPhone",` +
      `"addressLine1"=excluded."addressLine1","addressLine2"=null,city=excluded.city,state=excluded.state,"postalCode"=excluded."postalCode",country=excluded.country,gstin=null,source=excluded.source,"updatedAt"=now()`,
  );
}

/** On a Manage confirm screen: the saved profile is shown, nothing is typed and no billing form is offered. Stops with Pay available. */
export async function expectSavedProfile(page: Page) {
  const billing = page.getByRole("complementary", { name: "Billing and invoice details" });
  await expect(billing).toContainText("Invoices will be issued to the following billing profile");
  await expect(billing).toContainText("Bhandarys Kitchen");
  await expect(billing).toContainText("12 MG Road");
  await expect(billing).toContainText("Pune");
  await expect(billing).toContainText("411001");
  await expect(page.getByLabel("Business name")).toHaveCount(0);
}
