import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { GstRateTypeFields } from "@/components/payments/gst-rate-type-fields";
import type { WizardState } from "../types";

interface BusinessSetupStepProps {
  values: WizardState;
  setField: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
}

export function BusinessSetupStep({ values, setField }: BusinessSetupStepProps) {
  const hasGstNumber = values.gstNumber.trim().length > 0;
  const preview = `${values.orderNumberPrefix || "ORD"}-${values.orderNumberNextValue.padStart(Number(values.orderNumberPadding) || 4, "0")}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="gstNumber">GST number (optional)</Label>
          <Input id="gstNumber" maxLength={15} value={values.gstNumber} onChange={(e) => setField("gstNumber", e.target.value)} />
        </div>
        {hasGstNumber && (
          <GstRateTypeFields
            rate={values.gstRate}
            onRateChange={(value) => setField("gstRate", value)}
            type={values.gstType}
            onTypeChange={(value) => setField("gstType", value)}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          />
        )}
        <div className="flex items-center gap-2">
          <Checkbox id="gstShowOnInvoices" checked={values.gstShowOnInvoices} onCheckedChange={(checked) => setField("gstShowOnInvoices", checked === true)} />
          <Label htmlFor="gstShowOnInvoices">Show GST details on invoices</Label>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-5">
        <div>
          <h3 className="text-sm font-semibold">Order numbering</h3>
          <p className="text-xs text-muted-foreground">
            Every new order gets a number like <span className="font-mono">{preview}</span>, counting up by 1.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="orderNumberPrefix">Prefix</Label>
            <Input id="orderNumberPrefix" maxLength={10} value={values.orderNumberPrefix} onChange={(e) => setField("orderNumberPrefix", e.target.value.toUpperCase())} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="orderNumberNextValue">Starting number</Label>
            <Input id="orderNumberNextValue" type="number" min="1" value={values.orderNumberNextValue} onChange={(e) => setField("orderNumberNextValue", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="orderNumberPadding">Digits</Label>
            <Input id="orderNumberPadding" type="number" min="1" max="10" value={values.orderNumberPadding} onChange={(e) => setField("orderNumberPadding", e.target.value)} />
          </div>
        </div>
      </div>
    </div>
  );
}
