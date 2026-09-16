import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { WizardState } from "../types";

interface BusinessSetupStepProps {
  values: WizardState;
  setField: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
}

export function BusinessSetupStep({ values, setField }: BusinessSetupStepProps) {
  return (
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
        <Checkbox
          id="gstShowOnInvoices"
          checked={values.gstShowOnInvoices}
          onCheckedChange={(checked) => setField("gstShowOnInvoices", checked === true)}
        />
        <Label htmlFor="gstShowOnInvoices">Show GST details on invoices</Label>
      </div>
    </div>
  );
}
