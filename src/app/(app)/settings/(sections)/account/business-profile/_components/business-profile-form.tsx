"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageDropzone } from "@/components/ui/image-dropzone";
import { updateBusinessProfileAction } from "../actions";

export interface BusinessProfileFormValues {
  businessName: string;
  businessDescription: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  mobileNumber: string;
  gstNumber: string;
  gstShowOnInvoices: boolean;
  websiteUrl: string;
  instagramUrl: string;
  facebookUrl: string;
  logoUrl: string | null;
  orderNumberPrefix: string;
  orderNumberNextValue: string;
  orderNumberPadding: string;
}

// Chunk 4/5 — the same field set the onboarding wizard collects, reachable
// again here for a caterer who skipped it or wants to make changes later.
export function BusinessProfileForm({ initialValues }: { initialValues: BusinessProfileFormValues }) {
  const router = useRouter();
  const [values, setValues] = useState(initialValues);
  const [logo, setLogo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  function setField<K extends keyof BusinessProfileFormValues>(key: K, value: BusinessProfileFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    setPending(true);

    const formData = new FormData();
    formData.set("businessName", values.businessName);
    formData.set("businessDescription", values.businessDescription);
    formData.set("addressLine1", values.addressLine1);
    formData.set("city", values.city);
    formData.set("state", values.state);
    formData.set("postalCode", values.postalCode);
    formData.set("country", values.country);
    formData.set("mobileNumber", values.mobileNumber);
    formData.set("gstNumber", values.gstNumber);
    formData.set("gstShowOnInvoices", String(values.gstShowOnInvoices));
    formData.set("websiteUrl", values.websiteUrl);
    formData.set("instagramUrl", values.instagramUrl);
    formData.set("facebookUrl", values.facebookUrl);
    formData.set("orderNumberPrefix", values.orderNumberPrefix);
    formData.set("orderNumberNextValue", values.orderNumberNextValue);
    formData.set("orderNumberPadding", values.orderNumberPadding);
    if (logo) {
      formData.set("logo", logo);
    }

    const result = await updateBusinessProfileAction(formData);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-lg flex-col gap-6">
      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Business</h2>
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
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Contact & address</h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="addressLine1">Street address</Label>
          <Input
            id="addressLine1"
            value={values.addressLine1}
            onChange={(e) => setField("addressLine1", e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="city">City</Label>
            <Input id="city" value={values.city} onChange={(e) => setField("city", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="state">State</Label>
            <Input id="state" value={values.state} onChange={(e) => setField("state", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="postalCode">ZIP code</Label>
            <Input
              id="postalCode"
              value={values.postalCode}
              onChange={(e) => setField("postalCode", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="country">Country</Label>
            <Input id="country" value={values.country} onChange={(e) => setField("country", e.target.value)} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mobileNumber">Mobile number</Label>
          <Input
            id="mobileNumber"
            type="tel"
            value={values.mobileNumber}
            onChange={(e) => setField("mobileNumber", e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-muted-foreground">GST</h2>
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

      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Online presence</h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="websiteUrl">Website URL</Label>
          <Input
            id="websiteUrl"
            type="url"
            value={values.websiteUrl}
            onChange={(e) => setField("websiteUrl", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="instagramUrl">Instagram URL</Label>
          <Input
            id="instagramUrl"
            type="url"
            value={values.instagramUrl}
            onChange={(e) => setField("instagramUrl", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="facebookUrl">Facebook URL</Label>
          <Input
            id="facebookUrl"
            type="url"
            value={values.facebookUrl}
            onChange={(e) => setField("facebookUrl", e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Order Numbering</h2>
        <p className="text-xs text-muted-foreground">
          Every new order gets a number like <span className="font-mono">{values.orderNumberPrefix || "ORD"}-{values.orderNumberNextValue.padStart(Number(values.orderNumberPadding) || 4, "0")}</span>, incrementing by 1 each time. Changing the starting number resets the counter going forward — it never affects orders already created.
        </p>
        <div className="grid grid-cols-3 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="orderNumberPrefix">Prefix</Label>
            <Input
              id="orderNumberPrefix"
              maxLength={10}
              value={values.orderNumberPrefix}
              onChange={(e) => setField("orderNumberPrefix", e.target.value.toUpperCase())}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="orderNumberNextValue">Starting number</Label>
            <Input
              id="orderNumberNextValue"
              type="number"
              min="1"
              value={values.orderNumberNextValue}
              onChange={(e) => setField("orderNumberNextValue", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="orderNumberPadding">Digits</Label>
            <Input
              id="orderNumberPadding"
              type="number"
              min="1"
              max="10"
              value={values.orderNumberPadding}
              onChange={(e) => setField("orderNumberPadding", e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Brand identity</h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="logo">Logo</Label>
          <ImageDropzone id="logo" value={values.logoUrl} onFileSelect={setLogo} maxSizeMB={2} />
        </div>
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
