"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ActiveToggleCard } from "@/components/ui/active-toggle-card";
import { ImageDropzone } from "@/components/ui/image-dropzone";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ActionResult } from "../actions";

const FOOD_TYPE_OPTIONS = [
  { value: "VEGETARIAN", label: "Vegetarian" },
  { value: "NON_VEGETARIAN", label: "Non-Vegetarian" },
] as const;

export interface ItemFormValues {
  name: string;
  description: string;
  foodType: string;
  price: string;
  imageUrl: string | null;
  isActive: boolean;
  categoryIds: string[];
  menuIds: string[];
}

export const EMPTY_ITEM_VALUES: ItemFormValues = {
  name: "",
  description: "",
  foodType: "VEGETARIAN",
  price: "",
  imageUrl: null,
  isActive: true,
  categoryIds: [],
  menuIds: [],
};

interface ItemFormProps {
  initialValues?: Partial<ItemFormValues>;
  categories: { id: string; name: string }[];
  menus: { id: string; name: string }[];
  onSubmit: (formData: FormData) => Promise<ActionResult>;
  onSuccess: () => void;
  submitLabel: string;
}

export function ItemForm({ initialValues, categories, menus, onSubmit, onSuccess, submitLabel }: ItemFormProps) {
  const [values, setValues] = useState<ItemFormValues>({ ...EMPTY_ITEM_VALUES, ...initialValues });
  const [image, setImage] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function setField<K extends keyof ItemFormValues>(key: K, value: ItemFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function toggle(key: "categoryIds" | "menuIds", id: string, checked: boolean) {
    setField(key, checked ? [...values[key], id] : values[key].filter((v) => v !== id));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("description", values.description);
    formData.set("foodType", values.foodType);
    formData.set("price", values.price);
    formData.set("isActive", String(values.isActive));
    for (const id of values.categoryIds) formData.append("categoryIds", id);
    for (const id of values.menuIds) formData.append("menuIds", id);
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="item-name">Item Name</Label>
            <Input id="item-name" required value={values.name} onChange={(e) => setField("name", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="item-description">Item Description</Label>
            <Textarea
              id="item-description"
              value={values.description}
              onChange={(e) => setField("description", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="item-image">Image</Label>
            <ImageDropzone id="item-image" value={values.imageUrl} onFileSelect={setImage} maxSizeMB={2} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="item-food-type">Menu Type</Label>
            <Select
              items={Object.fromEntries(FOOD_TYPE_OPTIONS.map((o) => [o.value, o.label]))}
              value={values.foodType}
              onValueChange={(v) => setField("foodType", v ?? values.foodType)}
            >
              <SelectTrigger id="item-food-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FOOD_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="item-price">Item Price Per Plate</Label>
            <Input
              id="item-price"
              type="number"
              step="0.01"
              min="0"
              required
              value={values.price}
              onChange={(e) => setField("price", e.target.value)}
            />
          </div>
          <ActiveToggleCard
            id="item-active"
            checked={values.isActive}
            onCheckedChange={(checked) => setField("isActive", checked)}
            label="Active (visible to customers)"
          />
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Label>Assign to Menus</Label>
            <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border border-border p-3">
              {menus.map((menu) => (
                <label key={menu.id} htmlFor={`item-menu-${menu.id}`} className="flex cursor-pointer items-center gap-2 py-1">
                  <Checkbox
                    id={`item-menu-${menu.id}`}
                    checked={values.menuIds.includes(menu.id)}
                    onCheckedChange={(checked) => toggle("menuIds", menu.id, checked === true)}
                  />
                  <span className="text-sm">{menu.name}</span>
                </label>
              ))}
              {menus.length === 0 && <p className="text-sm text-muted-foreground">No menus yet — add some first.</p>}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Assign to Categories</Label>
            <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border border-border p-3">
              {categories.map((category) => (
                <label key={category.id} htmlFor={`item-category-${category.id}`} className="flex cursor-pointer items-center gap-2 py-1">
                  <Checkbox
                    id={`item-category-${category.id}`}
                    checked={values.categoryIds.includes(category.id)}
                    onCheckedChange={(checked) => toggle("categoryIds", category.id, checked === true)}
                  />
                  <span className="text-sm">{category.name}</span>
                </label>
              ))}
              {categories.length === 0 && <p className="text-sm text-muted-foreground">No categories yet — add some first.</p>}
            </div>
          </div>
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
