"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PlatformBillingInput } from "@/modules/subscriptions/platform-billing";
import { saveBillingProfileAction } from "../actions";

type Key = keyof PlatformBillingInput;

const GROUPS: { title: string; description?: string; fields: { key: Key; label: string; hint?: string; wide?: boolean; maxLength?: number }[] }[] = [
  {
    title: "Business",
    fields: [
      { key: "legalName", label: "Legal name", wide: true },
      { key: "addressLine1", label: "Address line 1", wide: true },
      { key: "addressLine2", label: "Address line 2", wide: true },
      { key: "city", label: "City" },
      { key: "postalCode", label: "PIN code" },
      { key: "state", label: "State" },
      { key: "country", label: "Country" },
    ],
  },
  {
    title: "Tax",
    description: "The state code decides whether a caterer is charged CGST + SGST (same state) or IGST (another state).",
    fields: [
      { key: "gstin", label: "GSTIN", hint: "15 characters, e.g. 29ABCDE1234F1Z5", maxLength: 15 },
      { key: "stateCode", label: "GST state code", hint: "Two digits, e.g. 29", maxLength: 2 },
      { key: "pan", label: "PAN", maxLength: 10 },
      { key: "sacCode", label: "SAC code", hint: "Printed on each invoice. Confirm the right code with your CA." },
    ],
  },
  {
    title: "Contact",
    fields: [
      { key: "email", label: "Support email" },
      { key: "phone", label: "Phone" },
      { key: "website", label: "Website", wide: true },
    ],
  },
];

export function BillingProfileForm({ initial, example }: { initial: PlatformBillingInput; example: string }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (key: Key, value: string) => setValues((previous) => ({ ...previous, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const result = await saveBillingProfileAction(values);
    setPending(false);
    setMessage(result.ok ? { ok: true, text: "Saved." } : { ok: false, text: result.error });
    if (result.ok) router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex max-w-2xl flex-col gap-6">
      {GROUPS.map((group) => (
        <Card key={group.title}>
          <CardHeader>
            <CardTitle>{group.title}</CardTitle>
            {group.description && <CardDescription>{group.description}</CardDescription>}
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {group.fields.map((field) => (
              <div key={field.key} className={`flex flex-col gap-1.5 ${field.wide ? "sm:col-span-2" : ""}`}>
                <Label htmlFor={field.key}>{field.label}</Label>
                <Input id={field.key} maxLength={field.maxLength} value={values[field.key]} onChange={(e) => set(field.key, e.target.value)} />
                {field.hint && <p className="text-xs text-muted-foreground">{field.hint}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>Invoice</CardTitle>
          <CardDescription>
            Numbers read prefix, caterer initials, year, month, running number. Example for &quot;ABC Caterer&quot;: <span className="font-medium text-foreground">{example}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invoicePrefix">Invoice prefix</Label>
            <Input id="invoicePrefix" className="max-w-40" maxLength={6} value={values.invoicePrefix} onChange={(e) => set("invoicePrefix", e.target.value.toUpperCase())} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invoiceNote">Note at the bottom of each invoice</Label>
            <Textarea id="invoiceNote" rows={3} value={values.invoiceNote} onChange={(e) => set("invoiceNote", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {message && (
        <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-success" : "text-destructive"}`}>
          {message.text}
        </p>
      )}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Save billing details"}
      </Button>
    </form>
  );
}
