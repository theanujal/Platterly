"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ActionResult } from "../actions";

const NONE = "__none__";

const FOOD_TYPE_OPTIONS = [
  { value: "VEGETARIAN", label: "Vegetarian" },
  { value: "NON_VEGETARIAN", label: "Non-Vegetarian" },
] as const;

const DIETARY_TYPE_OPTIONS = [
  { value: "STANDARD", label: "Standard" },
  { value: "JAIN", label: "Jain" },
  { value: "VEGAN", label: "Vegan" },
  { value: "GLUTEN_FREE", label: "Gluten-Free" },
] as const;

const EGG_INFO_OPTIONS = [
  { value: "NO_EGG", label: "No egg" },
  { value: "CONTAINS_EGG", label: "Contains egg" },
  { value: "EGG_OPTIONAL", label: "Egg optional" },
] as const;

export interface ItemFormValues {
  name: string;
  description: string;
  categoryId: string;
  isFoodProduct: boolean;
  foodType: string;
  dietaryType: string;
  eggInfo: string;
  price: string;
  imageUrl: string | null;
}

export const EMPTY_ITEM_VALUES: ItemFormValues = {
  name: "",
  description: "",
  categoryId: NONE,
  isFoodProduct: true,
  foodType: NONE,
  dietaryType: NONE,
  eggInfo: NONE,
  price: "",
  imageUrl: null,
};

interface ItemFormProps {
  initialValues?: Partial<ItemFormValues>;
  categories: { id: string; name: string }[];
  onSubmit: (formData: FormData) => Promise<ActionResult>;
  onSuccess: () => void;
  submitLabel: string;
}

export function ItemForm({ initialValues, categories, onSubmit, onSuccess, submitLabel }: ItemFormProps) {
  const [values, setValues] = useState<ItemFormValues>({ ...EMPTY_ITEM_VALUES, ...initialValues });
  const [image, setImage] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function setField<K extends keyof ItemFormValues>(key: K, value: ItemFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("description", values.description);
    formData.set("categoryId", values.categoryId === NONE ? "" : values.categoryId);
    formData.set("isFoodProduct", String(values.isFoodProduct));
    formData.set("foodType", values.foodType === NONE ? "" : values.foodType);
    formData.set("dietaryType", values.dietaryType === NONE ? "" : values.dietaryType);
    formData.set("eggInfo", values.eggInfo === NONE ? "" : values.eggInfo);
    formData.set("price", values.price);
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
          <Label htmlFor="item-name">Name</Label>
          <Input id="item-name" required value={values.name} onChange={(e) => setField("name", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="item-description">Description</Label>
          <Textarea
            id="item-description"
            value={values.description}
            onChange={(e) => setField("description", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="item-image">Image (PNG or JPG, up to 2MB)</Label>
          {values.imageUrl && !image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={values.imageUrl} alt="" className="size-16 rounded-lg border border-border object-cover" />
          )}
          <input
            id="item-image"
            type="file"
            accept="image/png,image/jpeg"
            onChange={(e) => setImage(e.target.files?.[0] ?? null)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="item-price">Price</Label>
          <Input
            id="item-price"
            type="number"
            step="0.01"
            min="0"
            required
            className="max-w-40"
            value={values.price}
            onChange={(e) => setField("price", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="item-category">Category</Label>
          <Select value={values.categoryId} onValueChange={(v) => setField("categoryId", v ?? NONE)}>
            <SelectTrigger id="item-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Uncategorized</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-4 border-t border-border pt-4">
        <label htmlFor="item-is-food" className="flex w-fit cursor-pointer items-center gap-2">
          <input
            id="item-is-food"
            type="checkbox"
            className="size-4"
            checked={values.isFoodProduct}
            onChange={(e) => setField("isFoodProduct", e.target.checked)}
          />
          <span className="text-sm font-medium">This is a food product</span>
        </label>

        {values.isFoodProduct && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="item-food-type">Veg / Non-Veg</Label>
              <Select value={values.foodType} onValueChange={(v) => setField("foodType", v ?? NONE)}>
                <SelectTrigger id="item-food-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not set</SelectItem>
                  {FOOD_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="item-dietary-type">Dietary type</Label>
              <Select value={values.dietaryType} onValueChange={(v) => setField("dietaryType", v ?? NONE)}>
                <SelectTrigger id="item-dietary-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not set</SelectItem>
                  {DIETARY_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="item-egg-info">Egg information</Label>
              <Select value={values.eggInfo} onValueChange={(v) => setField("eggInfo", v ?? NONE)}>
                <SelectTrigger id="item-egg-info">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not set</SelectItem>
                  {EGG_INFO_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
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
