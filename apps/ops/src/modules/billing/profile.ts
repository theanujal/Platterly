import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

/** Platterly's own details printed on plan invoices. One row; every field optional so it can be filled in later. */
const ID = "platform";
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN = /^[A-Z]{5}\d{4}[A-Z]$/;

export class ProfileError extends Error {}

export interface ProfileInput {
  legalName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  stateCode: string;
  postalCode: string;
  country: string;
  gstin: string;
  pan: string;
  sacCode: string;
  invoicePrefix: string;
  email: string;
  phone: string;
  website: string;
  invoiceNote: string;
}

export async function getProfile() {
  return prisma.platformBillingProfile.upsert({ where: { id: ID }, create: { id: ID }, update: {} });
}

export async function saveProfile(input: ProfileInput, actorUserId: string | null) {
  const clean = (value: string) => value.trim() || null;
  const gstin = input.gstin.trim().toUpperCase();
  const pan = input.pan.trim().toUpperCase();
  const stateCode = input.stateCode.trim();
  const prefix = input.invoicePrefix.trim().toUpperCase();
  if (gstin && !GSTIN.test(gstin)) throw new ProfileError("GSTIN should look like 29ABCDE1234F1Z5 (15 characters).");
  if (pan && !PAN.test(pan)) throw new ProfileError("PAN should look like ABCDE1234F.");
  if (stateCode && !/^\d{2}$/.test(stateCode)) throw new ProfileError("State code is two digits, for example 29.");
  if (gstin && stateCode && gstin.slice(0, 2) !== stateCode) throw new ProfileError("The GSTIN starts with a different state code than the one entered.");
  if (!/^[A-Z0-9]{1,6}$/.test(prefix)) throw new ProfileError("Invoice prefix is 1 to 6 letters or digits.");
  if (input.sacCode.trim() && !/^\d{4,8}$/.test(input.sacCode.trim())) throw new ProfileError("SAC code is 4 to 8 digits.");

  const data = {
    legalName: clean(input.legalName),
    addressLine1: clean(input.addressLine1),
    addressLine2: clean(input.addressLine2),
    city: clean(input.city),
    state: clean(input.state),
    stateCode: clean(stateCode),
    postalCode: clean(input.postalCode),
    country: clean(input.country),
    gstin: clean(gstin),
    pan: clean(pan),
    sacCode: input.sacCode.trim() || "998314",
    invoicePrefix: prefix,
    email: clean(input.email),
    phone: clean(input.phone),
    website: clean(input.website),
    invoiceNote: clean(input.invoiceNote),
  };
  const saved = await prisma.platformBillingProfile.upsert({ where: { id: ID }, create: { id: ID, ...data }, update: data });
  await audit({ actorUserId, action: "billing_profile.saved", subject: ID });
  return saved;
}
