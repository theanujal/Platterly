export interface WizardState {
  businessName: string;
  businessDescription: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  mobileNumber: string;
  gstNumber: string;
  gstShowOnInvoices: boolean;
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
  mobileNumber: "",
  gstNumber: "",
  gstShowOnInvoices: false,
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
