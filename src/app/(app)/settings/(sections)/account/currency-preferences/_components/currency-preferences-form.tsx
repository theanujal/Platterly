"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateCurrencyPreferencesAction } from "../actions";
import type { CurrencyPreferences } from "../types";

const ROUNDING_OPTIONS: { value: CurrencyPreferences["roundingMode"]; label: string }[] = [
  { value: "none", label: "No rounding" },
  { value: "nearest_1", label: "Nearest 1" },
  { value: "nearest_5", label: "Nearest 5" },
  { value: "nearest_10", label: "Nearest 10" },
];

export function CurrencyPreferencesForm({ initialValues }: { initialValues: CurrencyPreferences }) {
  const router = useRouter();
  const [symbol, setSymbol] = useState(initialValues.symbol);
  const [decimalPlaces, setDecimalPlaces] = useState(initialValues.decimalPlaces);
  const [roundingMode, setRoundingMode] = useState(initialValues.roundingMode);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(false);
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
    setSuccess(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-sm flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Display and formatting only — this doesn&apos;t change any calculations. India GST remains the only tax
        engine.
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="symbol">Currency symbol</Label>
        <Input id="symbol" required maxLength={3} value={symbol} onChange={(e) => setSymbol(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="decimalPlaces">Decimal places</Label>
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
          <SelectTrigger id="roundingMode">
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
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {success && <p className="text-sm text-emerald-600">Saved.</p>}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
