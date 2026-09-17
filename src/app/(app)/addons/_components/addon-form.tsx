"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ActiveToggleCard } from "@/components/ui/active-toggle-card";
import { ImageDropzone } from "@/components/ui/image-dropzone";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ActionResult } from "../actions";

const TYPE_OPTIONS = [
  { value: "LIVE_COUNTER", label: "Live Counter" },
  { value: "SPECIAL_ADD_ON", label: "Special Add-on" },
] as const;

const PRICE_TYPE_OPTIONS = [
  { value: "PER_PLATE", label: "Per Plate" },
  { value: "FIXED", label: "Fixed" },
] as const;

export interface AddOnFormValues {
  name: string;
  description: string;
  type: string;
  priceType: string;
  price: string;
  imageUrl: string | null;
  isActive: boolean;
}

export const EMPTY_ADDON_VALUES: AddOnFormValues = {
  name: "",
  description: "",
  type: "LIVE_COUNTER",
  priceType: "PER_PLATE",
  price: "",
  imageUrl: null,
  isActive: true,
};

interface AddOnFormProps {
  initialValues?: Partial<AddOnFormValues>;
  onSubmit: (formData: FormData) => Promise<ActionResult>;
  onSuccess: () => void;
  submitLabel: string;
}

export function AddOnForm({ initialValues, onSubmit, onSuccess, submitLabel }: AddOnFormProps) {
  const [values, setValues] = useState<AddOnFormValues>({ ...EMPTY_ADDON_VALUES, ...initialValues });
  const [image, setImage] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function setField<K extends keyof AddOnFormValues>(key: K, value: AddOnFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("description", values.description);
    formData.set("type", values.type);
    formData.set("priceType", values.priceType);
    formData.set("price", values.price);
    formData.set("isActive", String(values.isActive));
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
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="addon-name">Name</Label>
          <Input id="addon-name" required value={values.name} onChange={(e) => setField("name", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="addon-description">Description</Label>
          <Textarea
            id="addon-description"
            value={values.description}
            onChange={(e) => setField("description", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="addon-image">Image</Label>
          <ImageDropzone id="addon-image" value={values.imageUrl} onFileSelect={setImage} maxSizeMB={2} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="addon-type">Type</Label>
            <Select
              items={Object.fromEntries(TYPE_OPTIONS.map((o) => [o.value, o.label]))}
              value={values.type}
              onValueChange={(v) => setField("type", v ?? values.type)}
            >
              <SelectTrigger id="addon-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="addon-price-type">Price Type</Label>
            <Select
              items={Object.fromEntries(PRICE_TYPE_OPTIONS.map((o) => [o.value, o.label]))}
              value={values.priceType}
              onValueChange={(v) => setField("priceType", v ?? values.priceType)}
            >
              <SelectTrigger id="addon-price-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRICE_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="addon-price">Price</Label>
          <Input
            id="addon-price"
            type="number"
            step="0.01"
            min="0"
            required
            className="max-w-40"
            value={values.price}
            onChange={(e) => setField("price", e.target.value)}
          />
        </div>
      </div>

      <ActiveToggleCard
        id="addon-active"
        checked={values.isActive}
        onCheckedChange={(checked) => setField("isActive", checked)}
      />

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
