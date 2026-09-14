"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { completeOnboardingAction } from "../../actions";
import { OnboardingLayout } from "./onboarding-layout";
import { OnboardingStepHeader } from "./onboarding-step-header";
import { OnboardingBottomNav } from "./onboarding-bottom-nav";
import { BusinessBasicsStep } from "./steps/business-basics-step";
import { ContactAddressStep } from "./steps/contact-address-step";
import { BusinessSetupStep } from "./steps/business-setup-step";
import { OnlinePresenceStep } from "./steps/online-presence-step";
import { BrandIdentityStep } from "./steps/brand-identity-step";
import { EMPTY_WIZARD_STATE, STEP_LABELS, type WizardState, type StageStatus } from "./types";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

const STEP_CONTENT = [
  { heading: "Tell us about your business", supportingText: "This appears across Platterly and, eventually, your public storefront." },
  { heading: "Where can customers reach you?", supportingText: "Used for invoices and customer communication." },
  { heading: "GST details", supportingText: "Optional — add this now, or later in Settings." },
  { heading: "Your online presence", supportingText: "Optional links customers can find you on." },
  { heading: "Add your logo", supportingText: "Shown on invoices and your public menu." },
] as const;

interface OnboardingWizardProps {
  accountHolderFirstName: string;
  accountHolderLastName: string;
}

// Chunk 4 Group 4.3 — five-step wizard, PRD Updated-doc §3. Redesigned
// (AJ, 2026-09-14) into a split-screen shell with a persistent left stage
// list and a dedicated completion route — see OnboardingLayout and
// onboarding/complete/page.tsx. Reached only via the sign-up form's
// post-success redirect (never re-shown after that — see
// src/app/kitchenlogin/page.tsx). The Organization already exists by the
// time this renders (provisioned at signup), so "Skip for now" needs no
// server call, and the final submit is an update, not a create.
export function OnboardingWizard({ accountHolderFirstName, accountHolderLastName }: OnboardingWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [values, setValues] = useState<WizardState>(EMPTY_WIZARD_STATE);
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
    router.push("/kitchenlogin/onboarding/complete");
  }

  function handleContinue() {
    if (step < STEP_LABELS.length) {
      setStep(step + 1);
    } else {
      void handleFinish();
    }
  }

  const stages: { label: string; status: StageStatus }[] = STEP_LABELS.map((label, index) => ({
    label,
    status: index + 1 < step ? "completed" : index + 1 === step ? "active" : "pending",
  }));

  return (
    <OnboardingLayout steps={stages}>
      <OnboardingStepHeader
        stepIndicator={`Step ${step} of ${STEP_LABELS.length}`}
        heading={STEP_CONTENT[step - 1].heading}
        supportingText={STEP_CONTENT[step - 1].supportingText}
      />

      {step === 1 && (
        <BusinessBasicsStep
          accountHolderFirstName={accountHolderFirstName}
          accountHolderLastName={accountHolderLastName}
          values={values}
          setField={setField}
        />
      )}
      {step === 2 && <ContactAddressStep values={values} setField={setField} />}
      {step === 3 && <BusinessSetupStep values={values} setField={setField} />}
      {step === 4 && <OnlinePresenceStep values={values} setField={setField} />}
      {step === 5 && <BrandIdentityStep onLogoChange={handleLogoChange} logoError={logoError} />}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <OnboardingBottomNav
        showBack={step > 1}
        onBack={() => setStep(step - 1)}
        onSkip={() => router.push("/dashboard")}
        onContinue={handleContinue}
        continueLabel={step < STEP_LABELS.length ? "Continue" : "Complete Setup"}
        continueDisabled={step === 1 && !canAdvanceFromStep1()}
        pending={pending}
      />
    </OnboardingLayout>
  );
}
