"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStopEditing } from "../../../../_components/editable-panel";
import { FormFooter, InfoBox } from "../../../../_components/settings-ui";
import { updateCurrencyPreferencesAction } from "../actions";
import { ROUNDING_OPTIONS, type CurrencyPreferences } from "../types";

export function CurrencyPreferencesForm({ initialValues }: { initialValues: CurrencyPreferences }) {
  const router = useRouter();
  const stopEditing = useStopEditing();
  const [symbol, setSymbol] = useState(initialValues.symbol);
  const [decimalPlaces, setDecimalPlaces] = useState(initialValues.decimalPlaces);
  const [roundingMode, setRoundingMode] = useState(initialValues.roundingMode);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const formData = new FormData();
    formData.set("symbol", symbol);
    formData.set("decimalPlaces", String(decimalPlaces));
    formData.set("roundingMode", roundingMode);
    const result = await updateCurrencyPreferencesAction(formData);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
    stopEditing();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="symbol">Currency Symbol</Label>
        <Input id="symbol" required maxLength={3} value={symbol} onChange={(e) => setSymbol(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="decimalPlaces">Decimal Places</Label>
        <Input
          id="decimalPlaces"
          type="number"
          min={0}
          max={4}
          value={decimalPlaces}
          onChange={(e) => setDecimalPlaces(Number(e.target.value))}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="roundingMode">Rounding</Label>
        <Select
          items={Object.fromEntries(ROUNDING_OPTIONS.map((o) => [o.value, o.label]))}
          value={roundingMode}
          onValueChange={(value) => setRoundingMode(value as CurrencyPreferences["roundingMode"])}
        >
          <SelectTrigger id="roundingMode" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROUNDING_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <FormFooter error={error}>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save Changes"}
        </Button>
        <Button type="button" variant="outline" onClick={stopEditing}>
          Cancel
        </Button>
      </FormFooter>
      <InfoBox tone="neutral">
        <p>Display and formatting only — this doesn&apos;t change any calculations. India GST remains the only tax engine.</p>
      </InfoBox>
    </form>
  );
}
