"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PlanInput } from "@/modules/subscriptions/plan";

export interface PlanFormValues {
  code: string;
  name: string;
  description: string;
  isTrial: boolean;
  trialDurationDays: string;
  priceMonthly: string;
  priceAnnual: string;
  currency: string;
  maxUsers: string;
  maxEvents: string;
  maxOrders: string;
  maxKitchens: string;
  maxStores: string;
  maxCustomers: string;
  maxMenuLinks: string;
  maxStorageMb: string;
  maxReports: string;
  maxWhatsappMessages: string;
}

const EMPTY_VALUES: PlanFormValues = {
  code: "",
  name: "",
  description: "",
  isTrial: false,
  trialDurationDays: "",
  priceMonthly: "",
  priceAnnual: "",
  currency: "INR",
  maxUsers: "",
  maxEvents: "",
  maxOrders: "",
  maxKitchens: "",
  maxStores: "",
  maxCustomers: "",
  maxMenuLinks: "",
  maxStorageMb: "",
  maxReports: "",
  maxWhatsappMessages: "",
};

const LIMIT_FIELDS: { key: keyof PlanFormValues; label: string }[] = [
  { key: "maxUsers", label: "Max users" },
  { key: "maxEvents", label: "Max events" },
  { key: "maxOrders", label: "Max orders" },
  { key: "maxKitchens", label: "Max kitchens" },
  { key: "maxStores", label: "Max stores" },
  { key: "maxCustomers", label: "Max customers" },
  { key: "maxMenuLinks", label: "Max menu links" },
  { key: "maxStorageMb", label: "Max storage (MB)" },
  { key: "maxReports", label: "Max reports" },
  { key: "maxWhatsappMessages", label: "Max WhatsApp messages" },
];

function toOptionalInt(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? undefined : n;
}

function toOptionalFloat(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const n = Number.parseFloat(value);
  return Number.isNaN(n) ? undefined : n;
}

export function valuesToPlanInput(values: PlanFormValues): PlanInput {
  return {
    code: values.code,
    name: values.name,
    description: values.description || undefined,
    isTrial: values.isTrial,
    trialDurationDays: toOptionalInt(values.trialDurationDays),
    priceMonthly: toOptionalFloat(values.priceMonthly),
    priceAnnual: toOptionalFloat(values.priceAnnual),
    currency: values.currency || "INR",
    maxUsers: toOptionalInt(values.maxUsers),
    maxEvents: toOptionalInt(values.maxEvents),
    maxOrders: toOptionalInt(values.maxOrders),
    maxKitchens: toOptionalInt(values.maxKitchens),
    maxStores: toOptionalInt(values.maxStores),
    maxCustomers: toOptionalInt(values.maxCustomers),
    maxMenuLinks: toOptionalInt(values.maxMenuLinks),
    maxStorageMb: toOptionalInt(values.maxStorageMb),
    maxReports: toOptionalInt(values.maxReports),
    maxWhatsappMessages: toOptionalInt(values.maxWhatsappMessages),
  };
}

interface PlanFormProps {
  includeCode?: boolean;
  initialValues?: Partial<PlanFormValues>;
  onSubmit: (values: PlanFormValues) => Promise<{ ok: boolean; error?: string }>;
  onSuccess: () => void;
  submitLabel: string;
}

export function PlanForm({ includeCode = false, initialValues, onSubmit, onSuccess, submitLabel }: PlanFormProps) {
  const [values, setValues] = useState<PlanFormValues>({ ...EMPTY_VALUES, ...initialValues });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function setField<K extends keyof PlanFormValues>(key: K, value: PlanFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const result = await onSubmit(values);
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? "Something went wrong.");
      return;
    }
    onSuccess();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Basic information</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {includeCode && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="code">Code</Label>
              <Input
                id="code"
                required
                value={values.code}
                onChange={(e) => setField("code", e.target.value)}
              />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" required value={values.name} onChange={(e) => setField("name", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={values.description}
              onChange={(e) => setField("description", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pricing &amp; trial</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <label
            htmlFor="isTrial"
            className="flex w-fit cursor-pointer items-center gap-2 rounded-md py-1.5 -my-1.5"
          >
            <Checkbox
              id="isTrial"
              checked={values.isTrial}
              onCheckedChange={(checked) => setField("isTrial", checked === true)}
            />
            <span className="text-sm font-medium">Trial plan</span>
          </label>
          {values.isTrial && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="trialDurationDays">Trial duration (days)</Label>
              <Input
                id="trialDurationDays"
                type="number"
                className="max-w-40"
                value={values.trialDurationDays}
                onChange={(e) => setField("trialDurationDays", e.target.value)}
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="priceMonthly">Price / month</Label>
              <Input
                id="priceMonthly"
                type="number"
                value={values.priceMonthly}
                onChange={(e) => setField("priceMonthly", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="priceAnnual">Price / year</Label>
              <Input
                id="priceAnnual"
                type="number"
                value={values.priceAnnual}
                onChange={(e) => setField("priceAnnual", e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usage limits</CardTitle>
          <CardDescription>Leave a field blank for unlimited.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {LIMIT_FIELDS.map((field) => (
              <div key={field.key} className="flex flex-col gap-1.5">
                <Label htmlFor={field.key}>{field.label}</Label>
                <Input
                  id={field.key}
                  type="number"
                  value={values[field.key] as string}
                  onChange={(e) => setField(field.key, e.target.value)}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
