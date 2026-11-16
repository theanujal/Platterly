import { parseBuyer, type Buyer } from "./billing";
import { fail, isIsoDate, isRecord, ok, type ParseResult } from "./result";

/**
 * A business's saved billing details (F12.2.1): the name, address and GSTIN that start every purchase filled in and that the Account lets the Admin edit.
 * One record per business, kept by ops (the money side). The same checks run in the Store form, in the Account form and again in ops, so a hand-made request
 * cannot save a GSTIN or PIN code that the forms would have refused. An invoice keeps its own frozen copy of the details, so editing them never rewrites one.
 */

/** GSTIN: 15 characters, state code, PAN, entity, Z, check. */
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;
const PINCODE = /^\d{6}$/;

export type BuyerField = "name" | "addressLine1" | "city" | "state" | "postalCode" | "gstin";
export type ProfileField = BuyerField | "contactName" | "contactEmail" | "contactPhone" | "country";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** An Indian mobile number: ten digits starting 6 to 9, with an optional +91 or 0 in front and spaces or dashes anywhere. */
export function isIndianMobile(value: string): boolean {
  const digits = value.replace(/[\s-]/g, "").replace(/^(\+91|91|0)(?=\d{10}$)/, "");
  return /^[6-9]\d{9}$/.test(digits);
}

/** The Account's Billing Details form also needs a billing contact and the country; the Store checkout does not ask for them, so `checkBuyer` alone leaves them out. */
export function checkBillingProfile(buyer: Buyer): Partial<Record<ProfileField, string>> {
  const errors: Partial<Record<ProfileField, string>> = checkBuyer(buyer);
  if (!buyer.contactName?.trim()) errors.contactName = "Enter the billing contact person.";
  if (!EMAIL.test(buyer.contactEmail?.trim() ?? "")) errors.contactEmail = "Enter a valid billing email.";
  if (!isIndianMobile(buyer.contactPhone ?? "")) errors.contactPhone = "Enter a 10-digit mobile number.";
  if (!buyer.country?.trim()) errors.country = "Choose the country.";
  return errors;
}

/** Field by field problems with a set of billing details; empty when they are fine. GSTIN is optional, and accepted in lower case. */
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
