"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Building, Globe, Hash, MapPin, Palette, Receipt, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconInput } from "@/components/ui/icon-input";
import { FacebookIcon, InstagramIcon } from "@/components/ui/brand-icons";
import { Label } from "@/components/ui/label";
import { ImageDropzone } from "@/components/ui/image-dropzone";
import { PhoneInput } from "@/components/ui/phone-input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { COUNTRIES, INDIA_STATES } from "@/lib/india-states";
import { useStopEditing } from "../../../../_components/editable-panel";
import { FormFooter, SettingsSection } from "../../../../_components/settings-ui";
import { updateBusinessProfileAction, type ProfileConflict } from "../actions";
import { toast } from "@/components/ui/toaster";

/** The two cards of this page, like the Account's Business & Billing page: each has its own form and saves its own fields (the rest stay as they are). */
export interface BusinessCardValues {
  brandName: string;
  /** Whether the brand name is kept (it lives in the shared billing profile, which needs the Platterly Ops link). */
  showBrand: boolean;
  /** The version of the shared profile this form was opened on; sent back so a change made meanwhile in the Account is noticed. */
  profileVersion: string;
  businessDescription: string;
  mobileNumber: string;
  websiteUrl: string;
  instagramUrl: string;
  facebookUrl: string;
  logoUrl: string | null;
  orderNumberPrefix: string;
  orderNumberNextValue: string;
  orderNumberPadding: string;
}
export interface BillingCardValues {
  /** Whether the billing contact is kept (it lives in the shared billing profile, which needs the Platterly Ops link). */
  showShared: boolean;
  profileVersion: string;
  businessName: string;
  gstin: string;
  billingContactName: string;
  billingEmail: string;
  billingPhone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

function useCardForm<T extends { profileVersion: string }>(initialValues: T, section: "business" | "billing") {
  const router = useRouter();
  const stopEditing = useStopEditing();
  const [values, setValues] = useState(initialValues);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState<ProfileConflict | null>(null);

  function setField<K extends keyof T>(key: K, value: T[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }
  async function submit(formData: FormData) {
    setError(null);
    setPending(true);
    formData.set("section", section);
    formData.set("profileVersion", values.profileVersion);
    const result = await updateBusinessProfileAction(formData);
    setPending(false);
    if (!result.ok) {
      if (result.conflict) {
        // Changed elsewhere: keep what the person typed and base the next save on what is stored now.
        setConflict(result.conflict);
        setValues((prev) => ({ ...prev, profileVersion: result.conflict?.version ? String(result.conflict.version) : "" }));
      } else setError(result.error);
      return;
    }
    setConflict(null);
    toast.success(section === "business" ? "Business profile saved." : "Billing profile saved.");
    router.refresh();
    stopEditing();
  }
  function useNewValues() {
    if (!conflict?.values) return;
    setValues((prev) => ({ ...prev, ...(conflict.values as Partial<T>) }));
    setConflict(null);
  }
  return { values, setField, error, pending, conflict, submit, useNewValues, stopEditing };
}

function ConflictNotice({ conflict, onUse }: { conflict: ProfileConflict | null; onUse: () => void }) {
  if (!conflict) return null;
  return (
    <div role="alert" data-testid="profile-conflict" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
      <p>
        This profile was changed elsewhere (in the Account){conflict.at ? ` at ${new Date(conflict.at).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" })}` : ""}. Your edits are still here and nothing was lost.
        Review them, then press Save Changes again to keep yours{conflict.values ? ", or use the new values." : "."}
      </p>
      {conflict.values && (
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onUse}>
          Use the new values
        </Button>
      )}
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

export function BusinessProfileForm({ initialValues }: { initialValues: BusinessCardValues }) {
  const { values, setField, error, pending, conflict, submit, useNewValues, stopEditing } = useCardForm(initialValues, "business");
  const [logo, setLogo] = useState<File | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const formData = new FormData();
    formData.set("brandName", values.brandName);
    formData.set("businessDescription", values.businessDescription);
    formData.set("mobileNumber", values.mobileNumber);
    formData.set("websiteUrl", values.websiteUrl);
    formData.set("instagramUrl", values.instagramUrl);
    formData.set("facebookUrl", values.facebookUrl);
    formData.set("orderNumberPrefix", values.orderNumberPrefix);
    formData.set("orderNumberNextValue", values.orderNumberNextValue);
    formData.set("orderNumberPadding", values.orderNumberPadding);
    if (logo) formData.set("logo", logo);
    else if (!values.logoUrl) formData.set("removeLogo", "true");
    await submit(formData);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" aria-label="Edit business profile">
      <ConflictNotice conflict={conflict} onUse={useNewValues} />
      <SettingsSection icon={Palette} title="Brand Identity">
        <Field id="logo" label="Logo">
          <ImageDropzone id="logo" value={values.logoUrl} onFileSelect={setLogo} onRemove={() => setField("logoUrl", null)} maxSizeMB={4} />
        </Field>
      </SettingsSection>

      <SettingsSection icon={Store} title="Basic Information">
        {values.showBrand && (
          <Field id="brandName" label="Brand name">
            <Input id="brandName" value={values.brandName} onChange={(e) => setField("brandName", e.target.value)} />
          </Field>
        )}
        <Field id="businessDescription" label="Business description">
          <Input id="businessDescription" value={values.businessDescription} onChange={(e) => setField("businessDescription", e.target.value)} />
        </Field>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mobileNumber" required>Mobile number</Label>
          <PhoneInput id="mobileNumber" required value={values.mobileNumber} onChange={(value) => setField("mobileNumber", value)} />
        </div>
      </SettingsSection>

      <SettingsSection icon={Globe} title="Online Presence">
        <Field id="websiteUrl" label="Website URL">
          <IconInput icon={Globe} id="websiteUrl" placeholder="https://yourwebsite.com" type="url" value={values.websiteUrl} onChange={(e) => setField("websiteUrl", e.target.value)} />
        </Field>
        <Field id="instagramUrl" label="Instagram URL">
          <IconInput icon={InstagramIcon} id="instagramUrl" placeholder="https://instagram.com/yourkitchen" type="url" value={values.instagramUrl} onChange={(e) => setField("instagramUrl", e.target.value)} />
        </Field>
        <Field id="facebookUrl" label="Facebook URL">
          <IconInput icon={FacebookIcon} id="facebookUrl" placeholder="https://facebook.com/yourkitchen" type="url" value={values.facebookUrl} onChange={(e) => setField("facebookUrl", e.target.value)} />
        </Field>
      </SettingsSection>

      <SettingsSection icon={Hash} title="Order Numbering">
        <p className="text-xs text-muted-foreground">
          Every new order gets a number like <span className="font-mono">{values.orderNumberPrefix || "ORD"}-{values.orderNumberNextValue.padStart(Number(values.orderNumberPadding) || 4, "0")}</span>, incrementing by 1 each time. Changing the starting number resets the counter going forward — it never affects orders already created.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field id="orderNumberPrefix" label="Prefix">
            <Input id="orderNumberPrefix" maxLength={10} value={values.orderNumberPrefix} onChange={(e) => setField("orderNumberPrefix", e.target.value.toUpperCase())} />
          </Field>
          <Field id="orderNumberNextValue" label="Starting number">
            <Input id="orderNumberNextValue" type="number" min="1" value={values.orderNumberNextValue} onChange={(e) => setField("orderNumberNextValue", e.target.value)} />
          </Field>
          <Field id="orderNumberPadding" label="Digits">
            <Input id="orderNumberPadding" type="number" min="1" max="10" value={values.orderNumberPadding} onChange={(e) => setField("orderNumberPadding", e.target.value)} />
          </Field>
        </div>
      </SettingsSection>

      <FormFooter error={error}>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save Changes"}</Button>
        <Button type="button" variant="outline" onClick={stopEditing}>Cancel</Button>
      </FormFooter>
    </form>
  );
}

export function BillingProfileForm({ initialValues }: { initialValues: BillingCardValues }) {
  const { values, setField, error, pending, conflict, submit, useNewValues, stopEditing } = useCardForm(initialValues, "billing");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const formData = new FormData();
    for (const key of ["gstin", "addressLine1", "addressLine2", "city", "state", "postalCode", "country"] as const) formData.set(key, values[key]);
    if (values.showShared) {
      formData.set("businessName", values.businessName);
      formData.set("billingContactName", values.billingContactName);
      formData.set("billingEmail", values.billingEmail);
      formData.set("billingPhone", values.billingPhone);
    }
    await submit(formData);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" aria-label="Edit billing profile">
      <ConflictNotice conflict={conflict} onUse={useNewValues} />
      <SettingsSection icon={Receipt} title="Business & Tax">
        <p className="text-xs text-muted-foreground">Used for subscriptions and invoices. Changes apply to future invoices only.</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="businessName" label="Business name">
            <IconInput icon={Building} id="businessName" required value={values.businessName} onChange={(e) => setField("businessName", e.target.value)} />
          </Field>
          <Field id="gstin" label="GSTIN">
            <Input id="gstin" maxLength={15} placeholder="29ABCDE1234F1Z5" value={values.gstin} onChange={(e) => setField("gstin", e.target.value.toUpperCase())} />
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection icon={MapPin} title="Billing Address">
        <Field id="addressLine1" label="Street address">
          <Input id="addressLine1" value={values.addressLine1} onChange={(e) => setField("addressLine1", e.target.value)} />
        </Field>
        <Field id="addressLine2" label="Address line 2">
          <Input id="addressLine2" value={values.addressLine2} onChange={(e) => setField("addressLine2", e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="city" label="City">
            <Input id="city" value={values.city} onChange={(e) => setField("city", e.target.value)} />
          </Field>
          <Field id="state" label="State">
            <SearchableSelect aria-label="State" options={INDIA_STATES.map((n) => ({ value: n, label: n }))} value={values.state} onValueChange={(v) => setField("state", v)} placeholder="Select state" searchPlaceholder="Search states…" allowCustom />
          </Field>
          <Field id="postalCode" label="ZIP code">
            <Input id="postalCode" value={values.postalCode} onChange={(e) => setField("postalCode", e.target.value)} />
          </Field>
          <Field id="country" label="Country">
            <SearchableSelect aria-label="Country" options={COUNTRIES.map((n) => ({ value: n, label: n }))} value={values.country} onValueChange={(v) => setField("country", v)} placeholder="Select country" allowCustom />
          </Field>
        </div>
      </SettingsSection>

      {values.showShared && (
        <SettingsSection icon={Receipt} title="Billing Contact">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="billingContactName" label="Billing contact person">
              <Input id="billingContactName" value={values.billingContactName} onChange={(e) => setField("billingContactName", e.target.value)} />
            </Field>
            <Field id="billingEmail" label="Billing email">
              <Input id="billingEmail" type="email" value={values.billingEmail} onChange={(e) => setField("billingEmail", e.target.value)} />
            </Field>
            <Field id="billingPhone" label="Billing phone number">
              <PhoneInput id="billingPhone" value={values.billingPhone} onChange={(value) => setField("billingPhone", value)} />
            </Field>
          </div>
        </SettingsSection>
      )}

      <FormFooter error={error}>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save Changes"}</Button>
        <Button type="button" variant="outline" onClick={stopEditing}>Cancel</Button>
      </FormFooter>
    </form>
  );
}
