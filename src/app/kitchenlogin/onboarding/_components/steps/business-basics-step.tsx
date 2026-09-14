import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WizardState } from "../types";

interface BusinessBasicsStepProps {
  accountHolderFirstName: string;
  accountHolderLastName: string;
  values: WizardState;
  setField: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
}

export function BusinessBasicsStep({ accountHolderFirstName, accountHolderLastName, values, setField }: BusinessBasicsStepProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="accountHolderFirstName">First name</Label>
          <Input id="accountHolderFirstName" value={accountHolderFirstName} disabled readOnly />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="accountHolderLastName">Last name</Label>
          <Input id="accountHolderLastName" value={accountHolderLastName} disabled readOnly />
        </div>
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
  );
}
