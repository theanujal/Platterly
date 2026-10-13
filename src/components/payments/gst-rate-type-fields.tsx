"use client";

import { Percent } from "lucide-react";
import { IconInput } from "@/components/ui/icon-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** The GST rate (%) and type pair, shared by Settings -> Payments and the onboarding wizard. Kept per kitchen as the `payments.gst` setting. */
export function GstRateTypeFields({ rate, onRateChange, type, onTypeChange, className = "grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2" }: { rate: string; onRateChange: (value: string) => void; type: string; onTypeChange: (value: string) => void; className?: string }) {
  return (
    <div className={className}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="gst-rate">GST rate (%)</Label>
        <IconInput icon={Percent} id="gst-rate" type="number" min={0} max={28} step="0.01" value={rate} onChange={(e) => onRateChange(e.target.value)} />
        <p className="text-xs text-muted-foreground">Default for every new invoice. Default 5.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="gst-type">GST type</Label>
        <Select items={{ CGST_SGST: "CGST + SGST", IGST: "IGST" }} value={type} onValueChange={(v) => onTypeChange(v ?? type)}>
          <SelectTrigger id="gst-type" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="CGST_SGST">CGST + SGST</SelectItem>
            <SelectItem value="IGST">IGST</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">CGST + SGST within your state, IGST across states.</p>
      </div>
    </div>
  );
}
