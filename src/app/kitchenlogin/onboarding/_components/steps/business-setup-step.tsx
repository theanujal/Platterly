import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  );
}
