"use client";

import { useState } from "react";
import { Boxes, Tag, IndianRupee } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconInput } from "@/components/ui/icon-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImageDropzone } from "@/components/ui/image-dropzone";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ActionResult } from "../actions";

const UNIT_OPTIONS = [
  { value: "kg", label: "Kilogram (kg)" },
  { value: "g", label: "Gram (g)" },
  { value: "ltr", label: "Liter (ltr)" },
  { value: "ml", label: "Milliliter (ml)" },
  { value: "pcs", label: "Piece (pcs)" },
  { value: "dozen", label: "Dozen" },
  { value: "box", label: "Box" },
  { value: "packet", label: "Packet" },
  { value: "bag", label: "Bag" },
  { value: "bottle", label: "Bottle" },
] as const;

export interface InventoryFormValues {
  name: string;
  category: string;
  description: string;
  unit: string;
  lowStockThreshold: string;
  costPerUnit: string;
  storageLocation: string;
  supplierName: string;
  supplierContact: string;
  expiryDate: string;
  imageUrl: string | null;
}

export const EMPTY_INVENTORY_VALUES: InventoryFormValues = {
  name: "",
  category: "",
  description: "",
  unit: "",
  lowStockThreshold: "",
  costPerUnit: "",
  storageLocation: "",
  supplierName: "",
  supplierContact: "",
  expiryDate: "",
  imageUrl: null,
};

interface InventoryFormProps {
  initialValues?: Partial<InventoryFormValues>;
  /** Opening Stock is only offered at creation — every change after that goes through a Stock In/Out/Adjustment entry, never a direct field edit. */
  showOpeningStock?: boolean;
  onSubmit: (formData: FormData) => Promise<ActionResult>;
  onSuccess: () => void;
  submitLabel: string;
}

export function InventoryForm({ initialValues, showOpeningStock, onSubmit, onSuccess, submitLabel }: InventoryFormProps) {
  const [values, setValues] = useState<InventoryFormValues>({ ...EMPTY_INVENTORY_VALUES, ...initialValues });
  const [openingStock, setOpeningStock] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function setField<K extends keyof InventoryFormValues>(key: K, value: InventoryFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("category", values.category);
    formData.set("description", values.description);
    formData.set("unit", values.unit);
    formData.set("lowStockThreshold", values.lowStockThreshold);
    formData.set("costPerUnit", values.costPerUnit);
    formData.set("storageLocation", values.storageLocation);
    formData.set("supplierName", values.supplierName);
    formData.set("supplierContact", values.supplierContact);
    formData.set("expiryDate", values.expiryDate);
    if (showOpeningStock) formData.set("openingStock", openingStock);
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
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-6">
      {/* Field order per AJ's spec, 2026-09-19: Image; Name | Category;
          Description; Unit | Opening Stock; Low Stock Alert | Expiry Date;
          Cost Per Unit | Storage Location; Supplier Name | Supplier
          Contact. Opening Stock only exists at creation — an empty spacer
          div holds its grid slot in Edit mode so every other pair still
          lines up exactly the same as in Add. */}
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="inv-image">Image</Label>
          <ImageDropzone id="inv-image" value={values.imageUrl} onFileSelect={setImage} maxSizeMB={2} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="inv-name">Item Name</Label>
          <IconInput icon={Boxes} id="inv-name" required value={values.name} onChange={(e) => setField("name", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="inv-category">Category</Label>
          <IconInput icon={Tag} id="inv-category" required value={values.category} onChange={(e) => setField("category", e.target.value)} />
        </div>

        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="inv-description">Description</Label>
          <Textarea id="inv-description" value={values.description} onChange={(e) => setField("description", e.target.value)} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="inv-unit">Unit</Label>
          <Select items={Object.fromEntries(UNIT_OPTIONS.map((o) => [o.value, o.label]))} value={values.unit} onValueChange={(v) => setField("unit", v ?? "")}>
            <SelectTrigger id="inv-unit" className="w-full">
              <SelectValue placeholder="Select a unit" />
            </SelectTrigger>
            <SelectContent>
              {UNIT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {showOpeningStock ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="inv-opening-stock">Opening Stock</Label>
            <Input
              id="inv-opening-stock"
              type="number"
              step="0.01"
              min="0"
              value={openingStock}
              onChange={(e) => setOpeningStock(e.target.value)}
            />
          </div>
        ) : (
          <div aria-hidden="true" />
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="inv-low-stock">Low Stock Alert</Label>
          <Input
            id="inv-low-stock"
            type="number"
            step="0.01"
            min="0"
            value={values.lowStockThreshold}
            onChange={(e) => setField("lowStockThreshold", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="inv-expiry">Expiry Date</Label>
          <Input id="inv-expiry" type="date" value={values.expiryDate} onChange={(e) => setField("expiryDate", e.target.value)} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="inv-cost">Cost Per Unit</Label>
          <IconInput
            icon={IndianRupee}
            id="inv-cost"
            type="number"
            step="0.01"
            min="0"
            value={values.costPerUnit}
            onChange={(e) => setField("costPerUnit", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="inv-location">Storage Location</Label>
          <Input id="inv-location" value={values.storageLocation} onChange={(e) => setField("storageLocation", e.target.value)} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="inv-supplier-name">Supplier Name</Label>
          <Input id="inv-supplier-name" value={values.supplierName} onChange={(e) => setField("supplierName", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="inv-supplier-contact">Supplier Contact</Label>
          <Input id="inv-supplier-contact" value={values.supplierContact} onChange={(e) => setField("supplierContact", e.target.value)} />
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="self-end">
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
