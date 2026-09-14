"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calculatePackagePrice } from "@/modules/menus/pricing";
import type { ActionResult } from "../actions";
import type { PackageItemInput } from "@/modules/menus/package";

type ItemMode = "off" | "included" | "optional" | "addon";

interface ItemRowState {
  menuItemId: string;
  mode: ItemMode;
  extraPrice: string;
}

export interface PackageFormValues {
  name: string;
  description: string;
  imageUrl: string | null;
  pricingModel: "FIXED" | "PER_PERSON";
  fixedPrice: string;
  perPersonPrice: string;
  minGuests: string;
  maxGuests: string;
  itemRows: ItemRowState[];
}

export function emptyItemRows(availableItems: { id: string; name: string }[]): ItemRowState[] {
  return availableItems.map((item) => ({ menuItemId: item.id, mode: "off", extraPrice: "" }));
}

export const EMPTY_PACKAGE_VALUES: Omit<PackageFormValues, "itemRows"> = {
  name: "",
  description: "",
  imageUrl: null,
  pricingModel: "PER_PERSON",
  fixedPrice: "",
  perPersonPrice: "",
  minGuests: "",
  maxGuests: "",
};

interface PackageFormProps {
  initialValues?: Partial<PackageFormValues>;
  availableItems: { id: string; name: string }[];
  onSubmit: (formData: FormData) => Promise<ActionResult>;
  onSuccess: () => void;
  submitLabel: string;
}

export function PackageForm({ initialValues, availableItems, onSubmit, onSuccess, submitLabel }: PackageFormProps) {
  const [values, setValues] = useState<PackageFormValues>({
    ...EMPTY_PACKAGE_VALUES,
    itemRows: emptyItemRows(availableItems),
    ...initialValues,
  });
  const [image, setImage] = useState<File | null>(null);
  const [previewGuests, setPreviewGuests] = useState("10");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function setField<K extends keyof PackageFormValues>(key: K, value: PackageFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function setRow(menuItemId: string, patch: Partial<ItemRowState>) {
    setField(
      "itemRows",
      values.itemRows.map((row) => (row.menuItemId === menuItemId ? { ...row, ...patch } : row)),
    );
  }

  const preview = useMemo(() => {
    const guestCount = Number.parseInt(previewGuests, 10);
    if (Number.isNaN(guestCount)) return null;
    try {
      const total = calculatePackagePrice(
        {
          pricingModel: values.pricingModel,
          fixedPrice: Number.parseFloat(values.fixedPrice) || null,
          perPersonPrice: Number.parseFloat(values.perPersonPrice) || null,
          minGuests: values.minGuests ? Number.parseInt(values.minGuests, 10) : null,
          maxGuests: values.maxGuests ? Number.parseInt(values.maxGuests, 10) : null,
        },
        guestCount,
        values.itemRows
          .filter((row) => row.mode !== "off")
          .map((row) => ({
            isOptional: row.mode === "optional",
            isAddOn: row.mode === "addon",
            extraPrice: Number.parseFloat(row.extraPrice) || null,
            selected: true,
          })),
      );
      return { total, error: null as string | null };
    } catch (err) {
      return { total: null, error: err instanceof Error ? err.message : "Invalid" };
    }
  }, [values, previewGuests]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const items: PackageItemInput[] = values.itemRows
      .filter((row) => row.mode !== "off")
      .map((row) => ({
        menuItemId: row.menuItemId,
        isOptional: row.mode === "optional",
        isAddOn: row.mode === "addon",
        extraPrice: row.extraPrice ? Number.parseFloat(row.extraPrice) : undefined,
      }));

    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("description", values.description);
    formData.set("pricingModel", values.pricingModel);
    formData.set("fixedPrice", values.fixedPrice);
    formData.set("perPersonPrice", values.perPersonPrice);
    formData.set("minGuests", values.minGuests);
    formData.set("maxGuests", values.maxGuests);
    formData.set("items", JSON.stringify(items));
    if (image) formData.set("image", image);

    const result = await onSubmit(formData);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSuccess();
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="package-name">Name</Label>
          <Input id="package-name" required value={values.name} onChange={(e) => setField("name", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="package-description">Description</Label>
          <Textarea id="package-description" value={values.description} onChange={(e) => setField("description", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="package-image">Image (PNG or JPG, up to 2MB)</Label>
          {values.imageUrl && !image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={values.imageUrl} alt="" className="size-16 rounded-lg border border-border object-cover" />
          )}
          <input id="package-image" type="file" accept="image/png,image/jpeg" onChange={(e) => setImage(e.target.files?.[0] ?? null)} />
        </div>
      </div>

      <div className="flex flex-col gap-4 border-t border-border pt-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="package-pricing-model">Pricing model</Label>
          <Select value={values.pricingModel} onValueChange={(v) => setField("pricingModel", (v as "FIXED" | "PER_PERSON") ?? "FIXED")}>
            <SelectTrigger id="package-pricing-model" className="max-w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="FIXED">Fixed price</SelectItem>
              <SelectItem value="PER_PERSON">Per person</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {values.pricingModel === "FIXED" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="package-fixed-price">Fixed price</Label>
              <Input id="package-fixed-price" type="number" step="0.01" min="0" required value={values.fixedPrice} onChange={(e) => setField("fixedPrice", e.target.value)} />
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="package-per-person-price">Price per person</Label>
              <Input id="package-per-person-price" type="number" step="0.01" min="0" required value={values.perPersonPrice} onChange={(e) => setField("perPersonPrice", e.target.value)} />
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="package-min-guests">Min guests</Label>
            <Input id="package-min-guests" type="number" min="0" value={values.minGuests} onChange={(e) => setField("minGuests", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="package-max-guests">Max guests</Label>
            <Input id="package-max-guests" type="number" min="0" value={values.maxGuests} onChange={(e) => setField("maxGuests", e.target.value)} />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <Label>Package items</Label>
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          {values.itemRows.map((row) => {
            const item = availableItems.find((i) => i.id === row.menuItemId);
            if (!item) return null;
            return (
              <div key={row.menuItemId} className="flex flex-wrap items-center gap-2 border-b border-border/50 pb-2 last:border-0 last:pb-0">
                <span className="min-w-40 flex-1 text-sm">{item.name}</span>
                <Select value={row.mode} onValueChange={(v) => setRow(row.menuItemId, { mode: (v as ItemMode) ?? "off" })}>
                  <SelectTrigger size="sm" className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="off">Not in package</SelectItem>
                    <SelectItem value="included">Included</SelectItem>
                    <SelectItem value="optional">Optional</SelectItem>
                    <SelectItem value="addon">Add-on</SelectItem>
                  </SelectContent>
                </Select>
                {(row.mode === "optional" || row.mode === "addon") && (
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Extra price"
                    className="w-32"
                    value={row.extraPrice}
                    onChange={(e) => setRow(row.menuItemId, { extraPrice: e.target.value })}
                  />
                )}
              </div>
            );
          })}
          {availableItems.length === 0 && <p className="text-sm text-muted-foreground">No active menu items yet — add some first.</p>}
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-md bg-muted p-3">
        <div className="flex items-center gap-2">
          <Label htmlFor="preview-guests" className="text-xs text-muted-foreground">
            Preview price for
          </Label>
          <Input id="preview-guests" type="number" min="1" className="w-24" value={previewGuests} onChange={(e) => setPreviewGuests(e.target.value)} />
          <span className="text-xs text-muted-foreground">guests</span>
        </div>
        {preview?.error ? (
          <p className="text-sm text-destructive">{preview.error}</p>
        ) : (
          <p className="text-lg font-semibold">₹{(preview?.total ?? 0).toFixed(2)}</p>
        )}
      </div>

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
