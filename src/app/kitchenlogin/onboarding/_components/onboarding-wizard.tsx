"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { completeOnboardingAction } from "../../actions";

interface WizardState {
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

const EMPTY_STATE: WizardState = {
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

const STEP_LABELS = [
  "Getting Started",
  "Contact & Address",
  "Business Setup",
  "Online Presence",
  "Brand Identity",
];

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

interface OnboardingWizardProps {
  /** The account holder's name from signup — read-only display in Step 1, never edited here. */
  accountHolderName: string;
}

// Chunk 4 Group 4.3 — five-step wizard, PRD Updated-doc §3. Reached only via
// the sign-up form's post-success redirect (never re-shown after that — see
// src/app/kitchenlogin/page.tsx). The Organization already exists by the
// time this renders (provisioned at signup), so "Skip for now" needs no
// server call, and the final submit is an update, not a create.
export function OnboardingWizard({ accountHolderName }: OnboardingWizardProps) {
  const router = useRouter();
  const [screen, setScreen] = useState<"wizard" | "done">("wizard");
  const [step, setStep] = useState(1);
  const [values, setValues] = useState<WizardState>(EMPTY_STATE);
  const [logo, setLogo] = useState<File | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function setField<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleLogoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (file && file.size > MAX_LOGO_BYTES) {
      setLogoError("Logo must be 2MB or smaller.");
      setLogo(null);
      return;
    }
    if (file && file.type !== "image/png" && file.type !== "image/jpeg") {
      setLogoError("Logo must be a PNG or JPG image.");
      setLogo(null);
      return;
    }
    setLogoError(null);
    setLogo(file);
  }

  function canAdvanceFromStep1() {
    return values.businessName.trim().length > 0;
  }

  async function handleFinish() {
    setError(null);
    setPending(true);

    const formData = new FormData();
    formData.set("businessName", values.businessName);
    formData.set("businessDescription", values.businessDescription);
    formData.set("addressLine1", values.addressLine1);
    formData.set("city", values.city);
    formData.set("state", values.state);
    formData.set("postalCode", values.postalCode);
    formData.set("country", values.country);
    formData.set("mobileNumber", values.mobileNumber);
    formData.set("gstNumber", values.gstNumber);
    formData.set("gstShowOnInvoices", String(values.gstShowOnInvoices));
    formData.set("websiteUrl", values.websiteUrl);
    formData.set("instagramUrl", values.instagramUrl);
    formData.set("facebookUrl", values.facebookUrl);
    if (logo) {
      formData.set("logo", logo);
    }

    const result = await completeOnboardingAction(formData);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setScreen("done");
  }

  if (screen === "done") {
    return (
      <div className="flex w-full max-w-lg flex-col items-center gap-4 text-center">
        <h1 className="text-2xl font-bold">Your Platterly account is ready!</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          You can now start managing your orders, inventory, and grow your catering business.
        </p>
        <Button className="h-11 rounded-full px-8 text-base font-semibold" onClick={() => router.push("/dashboard")}>
          Take me to my Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-lg flex-col gap-6">
      <div className="flex items-center justify-between">
        <Progress value={(step / STEP_LABELS.length) * 100} className="flex-1">
          <span className="text-sm font-medium">
            Step {step} of {STEP_LABELS.length}: {STEP_LABELS[step - 1]}
          </span>
        </Progress>
        <button
          type="button"
          className="ml-4 shrink-0 text-sm font-medium text-muted-foreground hover:text-foreground hover:underline"
          onClick={() => router.push("/dashboard")}
        >
          Skip for now
        </button>
      </div>

      {step === 1 && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="accountHolderName">Full name</Label>
            <Input id="accountHolderName" value={accountHolderName} disabled readOnly />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="businessName">Company / business name</Label>
            <Input
              id="businessName"
              required
              value={values.businessName}
              onChange={(e) => setField("businessName", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="businessDescription">Business description</Label>
            <Input
              id="businessDescription"
              value={values.businessDescription}
              onChange={(e) => setField("businessDescription", e.target.value)}
            />
            <p className="text-xs text-neutral-500">Appears on your public storefront page later.</p>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="addressLine1">Street address</Label>
            <Input
              id="addressLine1"
              value={values.addressLine1}
              onChange={(e) => setField("addressLine1", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="city">City</Label>
              <Input id="city" value={values.city} onChange={(e) => setField("city", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="state">State</Label>
              <Input id="state" value={values.state} onChange={(e) => setField("state", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="postalCode">ZIP code</Label>
              <Input
                id="postalCode"
                value={values.postalCode}
                onChange={(e) => setField("postalCode", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="country">Country</Label>
              <Input id="country" value={values.country} onChange={(e) => setField("country", e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mobileNumber">Mobile number</Label>
            <Input
              id="mobileNumber"
              type="tel"
              value={values.mobileNumber}
              onChange={(e) => setField("mobileNumber", e.target.value)}
            />
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="gstNumber">GST number (optional)</Label>
            <Input
              id="gstNumber"
              maxLength={15}
              value={values.gstNumber}
              onChange={(e) => setField("gstNumber", e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="gstShowOnInvoices"
              type="checkbox"
              className="size-4"
              checked={values.gstShowOnInvoices}
              onChange={(e) => setField("gstShowOnInvoices", e.target.checked)}
            />
            <Label htmlFor="gstShowOnInvoices">Show GST details on invoices</Label>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="websiteUrl">Website URL</Label>
            <Input
              id="websiteUrl"
              type="url"
              value={values.websiteUrl}
              onChange={(e) => setField("websiteUrl", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="instagramUrl">Instagram URL</Label>
            <Input
              id="instagramUrl"
              type="url"
              value={values.instagramUrl}
              onChange={(e) => setField("instagramUrl", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="facebookUrl">Facebook URL</Label>
            <Input
              id="facebookUrl"
              type="url"
              value={values.facebookUrl}
              onChange={(e) => setField("facebookUrl", e.target.value)}
            />
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="logo">Logo (PNG or JPG, up to 2MB)</Label>
            <input id="logo" type="file" accept="image/png,image/jpeg" onChange={handleLogoChange} />
          </div>
          {logoError && (
            <p role="alert" className="text-sm text-destructive">
              {logoError}
            </p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-between">
        <Button type="button" variant="outline" disabled={step === 1 || pending} onClick={() => setStep(step - 1)}>
          Back
        </Button>
        {step < STEP_LABELS.length ? (
          <Button type="button" disabled={step === 1 && !canAdvanceFromStep1()} onClick={() => setStep(step + 1)}>
            Next
          </Button>
        ) : (
          <Button type="button" disabled={pending} onClick={handleFinish}>
            {pending ? "Finishing setup…" : "Complete Setup"}
          </Button>
        )}
      </div>
    </div>
  );
}
