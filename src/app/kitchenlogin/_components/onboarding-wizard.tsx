"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { completeOnboardingAction } from "../actions";

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

// Chunk 4 Group 4.3 — five-step wizard, PRD Updated-doc §3. All client-side
// state until the final submit; nothing is written to the server until
// Step 5's "Complete Setup" (see completeOnboardingAction).
export function OnboardingWizard() {
  const router = useRouter();
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
    router.refresh();
  }

  return (
    <div className="flex w-full max-w-lg flex-col gap-6">
      <Progress value={(step / STEP_LABELS.length) * 100}>
        <span className="text-sm font-medium">
          Step {step} of {STEP_LABELS.length}: {STEP_LABELS[step - 1]}
        </span>
      </Progress>

      {step === 1 && (
        <div className="flex flex-col gap-4">
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
