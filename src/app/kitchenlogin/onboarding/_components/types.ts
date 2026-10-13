export interface WizardState {
  businessName: string;
  businessDescription: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  /** The business's mobile number (E.164), saved as the organization's contactPhone. */
  contactPhone: string;
  gstNumber: string;
  gstShowOnInvoices: boolean;
  /** Kept per kitchen (the `payments.gst` setting), not on the organization. */
  gstRate: string;
  gstType: string;
  orderNumberPrefix: string;
  orderNumberNextValue: string;
  orderNumberPadding: string;
  websiteUrl: string;
  instagramUrl: string;
  facebookUrl: string;
}

export const EMPTY_WIZARD_STATE: WizardState = {
  businessName: "",
  businessDescription: "",
  addressLine1: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
  contactPhone: "",
  gstNumber: "",
  gstShowOnInvoices: false,
  gstRate: "5",
  gstType: "CGST_SGST",
  orderNumberPrefix: "ORD",
  orderNumberNextValue: "1",
  orderNumberPadding: "4",
  websiteUrl: "",
  instagramUrl: "",
  facebookUrl: "",
};

export const STEP_LABELS = [
  "Getting Started",
  "Contact & Address",
  "Business Setup",
  "Online Presence",
  "Brand Identity",
] as const;

export type StageStatus = "completed" | "active" | "pending";
