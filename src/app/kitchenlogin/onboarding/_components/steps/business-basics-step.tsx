import { Building2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { IconInput } from "../../../_components/icon-input";
import type { WizardState } from "../types";

const BUSINESS_NAME_MAX = 60;
const BUSINESS_DESCRIPTION_MAX = 500;

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
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="businessName" required>Company / business name</Label>
          <span className="text-xs text-muted-foreground">{values.businessName.length}/{BUSINESS_NAME_MAX}</span>
        </div>
        <IconInput
          id="businessName"
          icon={Building2}
          required
          maxLength={BUSINESS_NAME_MAX}
          placeholder="ABC Catering Services"
          value={values.businessName}
          onChange={(e) => setField("businessName", e.target.value)}
        />
        <p className="text-xs text-muted-foreground">Your business/company name</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="businessDescription">Business description</Label>
          <span className="text-xs text-muted-foreground">{values.businessDescription.length}/{BUSINESS_DESCRIPTION_MAX}</span>
        </div>
        <Textarea
          id="businessDescription"
          maxLength={BUSINESS_DESCRIPTION_MAX}
          placeholder="Tell us what makes your Catering special..."
          value={values.businessDescription}
          onChange={(e) => setField("businessDescription", e.target.value)}
        />
        <p className="text-xs text-muted-foreground">This will be shown to your customers on your menu page</p>
      </div>
    </div>
  );
}
