import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WizardState } from "../types";

interface ContactAddressStepProps {
  values: WizardState;
  setField: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
}

export function ContactAddressStep({ values, setField }: ContactAddressStepProps) {
  return (
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
  );
}
