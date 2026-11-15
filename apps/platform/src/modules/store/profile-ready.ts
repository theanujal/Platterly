import type { Buyer, ProductBillingProfileRecord } from "@platterly/contract";

const filled = (v: string | null | undefined) => Boolean(v && v.trim());

/** What a product's billing profile needs before an invoice can be issued to it (the Account's "Billing Profile" card shows the same rule as complete). One rule, shared by the Account and the Store. */
export const billingComplete = (p: ProductBillingProfileRecord | null) =>
  Boolean(p && filled(p.name) && filled(p.addressLine1) && filled(p.city) && filled(p.state) && /^\d{6}$/.test(p.postalCode ?? "") && filled(p.country) && filled(p.contactName) && filled(p.contactEmail) && filled(p.contactPhone));

/** The part of the saved profile an invoice carries. The Store passes this to Ops with a payment; it never builds it from anything a person typed in the Store. */
export const buyerFromProfile = (p: ProductBillingProfileRecord): Buyer => ({ name: p.name, addressLine1: p.addressLine1, addressLine2: p.addressLine2, city: p.city, state: p.state, postalCode: p.postalCode, country: p.country ?? "India", gstin: p.gstin });
