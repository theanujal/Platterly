import { MapPin, Hash, Globe } from "lucide-react";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { IconInput } from "../../../_components/icon-input";
import type { WizardState } from "../types";

interface ContactAddressStepProps {
  values: WizardState;
  setField: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
}

// AJ's explicit ask (2026-09-16): every field here is now mandatory (see
// onboarding-wizard.tsx's canAdvanceFromStep2 for the matching gate, and
// actions.ts's completeOnboardingAction for the server-side check).
export function ContactAddressStep({ values, setField }: ContactAddressStepProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="addressLine1" required>Street address</Label>
        <IconInput
          id="addressLine1"
          icon={MapPin}
          required
          value={values.addressLine1}
          onChange={(e) => setField("addressLine1", e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="city" required>City</Label>
          <IconInput id="city" icon={MapPin} required value={values.city} onChange={(e) => setField("city", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="state" required>State</Label>
          <IconInput id="state" icon={MapPin} required value={values.state} onChange={(e) => setField("state", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="postalCode" required>ZIP code</Label>
          <IconInput
            id="postalCode"
            icon={Hash}
            required
            value={values.postalCode}
            onChange={(e) => setField("postalCode", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="country" required>Country</Label>
          <IconInput id="country" icon={Globe} required value={values.country} onChange={(e) => setField("country", e.target.value)} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="mobileNumber" required>Mobile number</Label>
        <PhoneInput
          id="mobileNumber"
          required
          value={values.mobileNumber}
          onChange={(value) => setField("mobileNumber", value)}
        />
      </div>
    </div>
  );
}
