import type { Buyer } from "@platterly/contract";

/** Shape checks for the billing details form (S2, sample only: nothing is sent anywhere). GSTIN: 15 characters, state code, PAN, entity, Z, check. */
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;
const PINCODE = /^\d{6}$/;

export type BuyerField = "name" | "addressLine1" | "city" | "state" | "postalCode" | "gstin";

export function checkBuyer(buyer: Buyer): Partial<Record<BuyerField, string>> {
  const errors: Partial<Record<BuyerField, string>> = {};
  if (!buyer.name?.trim()) errors.name = "Enter your business name.";
  if (!buyer.addressLine1?.trim()) errors.addressLine1 = "Enter the billing address.";
  if (!buyer.city?.trim()) errors.city = "Enter the city.";
  if (!buyer.state?.trim()) errors.state = "Enter the state.";
  if (!PINCODE.test(buyer.postalCode?.trim() ?? "")) errors.postalCode = "Enter a 6-digit PIN code.";
  const gstin = buyer.gstin?.trim().toUpperCase() ?? "";
  if (gstin && !GSTIN.test(gstin)) errors.gstin = "Enter a valid 15-character GSTIN, or leave it blank.";
  return errors;
}
