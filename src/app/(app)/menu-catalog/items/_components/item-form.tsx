"use client";

import { useState } from "react";
import { UtensilsCrossed, IndianRupee } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconInput } from "@/components/ui/icon-input";
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

const ORIGIN_OPTIONS = [
  { value: "NORTH_INDIAN", label: "North Indian" },
  { value: "SOUTH_INDIAN", label: "South Indian" },
  { value: "PUNJABI", label: "Punjabi" },
  { value: "GUJARATI", label: "Gujarati" },
  { value: "BENGALI", label: "Bengali" },
  { value: "MUGHLAI", label: "Mughlai" },
  { value: "CHINESE", label: "Chinese" },
  { value: "CONTINENTAL", label: "Continental" },
  { value: "ITALIAN", label: "Italian" },
  { value: "MEXICAN", label: "Mexican" },
  { value: "THAI", label: "Thai" },
  { value: "SOUTH_EAST_ASIAN", label: "South East Asian" },
  { value: "FUSION", label: "Fusion" },
  { value: "OTHER", label: "Other" },
] as const;

const BASE_TYPE_OPTIONS = [
  { value: "GRAVY_BASED", label: "Gravy-based" },
  { value: "DRY", label: "Dry" },
  { value: "CREAM_BASED", label: "Cream-based" },
  { value: "TOMATO_BASED", label: "Tomato-based" },
  { value: "COCONUT_BASED", label: "Coconut-based" },
  { value: "YOGURT_BASED", label: "Yogurt-based" },
  { value: "CLEAR", label: "Clear" },
  { value: "OTHER", label: "Other" },
] as const;

const PREPARATION_METHOD_OPTIONS = [
  { value: "GRILLED", label: "Grilled" },
  { value: "ROASTED", label: "Roasted" },
  { value: "DEEP_FRIED", label: "Deep Fried" },
  { value: "SHALLOW_FRIED", label: "Shallow Fried" },
  { value: "STEAMED", label: "Steamed" },
  { value: "SAUTEED", label: "Sautéed" },
  { value: "BAKED", label: "Baked" },
  { value: "BOILED", label: "Boiled" },
  { value: "TANDOOR", label: "Tandoor" },
  { value: "RAW", label: "Raw" },
  { value: "SLOW_COOKED", label: "Slow Cooked" },
  { value: "OTHER", label: "Other" },
] as const;

const SPICE_LEVEL_OPTIONS = [
  { value: "NONE", label: "None" },
  { value: "MILD", label: "Mild" },
  { value: "MEDIUM", label: "Medium" },
  { value: "SPICY", label: "Spicy" },
  { value: "EXTRA_SPICY", label: "Extra Spicy" },
] as const;

const ONION_GARLIC_OPTIONS = [
  { value: "WITH_ONION_GARLIC", label: "With Onion & Garlic" },
  { value: "WITHOUT_ONION_GARLIC", label: "Without Onion & Garlic (Jain-friendly)" },
] as const;

const TEXTURE_OPTIONS = [
  { value: "CRISPY", label: "Crispy" },
  { value: "SOFT", label: "Soft" },
  { value: "CREAMY", label: "Creamy" },
  { value: "CRUNCHY", label: "Crunchy" },
  { value: "SMOOTH", label: "Smooth" },
  { value: "CHEWY", label: "Chewy" },
  { value: "JUICY", label: "Juicy" },
  { value: "FLAKY", label: "Flaky" },
  { value: "OTHER", label: "Other" },
] as const;

const TASTE_PROFILE_OPTIONS = [
  { value: "SWEET", label: "Sweet" },
  { value: "SOUR", label: "Sour" },
  { value: "SPICY", label: "Spicy" },
  { value: "TANGY", label: "Tangy" },
  { value: "SAVORY", label: "Savory" },
  { value: "BITTER", label: "Bitter" },
  { value: "UMAMI", label: "Umami" },
  { value: "MILD", label: "Mild" },
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
  /** Additional Details — all optional; "" means not specified. */
  origin: string;
  baseType: string;
  preparationMethod: string;
  spiceLevel: string;
  onionGarlic: string;
  vegFriendly: boolean;
  nonVegFriendly: boolean;
  texture: string;
  tasteProfile: string;
  keyIngredients: string;
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
  origin: "",
  baseType: "",
  preparationMethod: "",
  spiceLevel: "",
  onionGarlic: "",
  vegFriendly: false,
  nonVegFriendly: false,
  texture: "",
  tasteProfile: "",
  keyIngredients: "",
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
    formData.set("origin", values.origin);
    formData.set("baseType", values.baseType);
    formData.set("preparationMethod", values.preparationMethod);
    formData.set("spiceLevel", values.spiceLevel);
    formData.set("onionGarlic", values.onionGarlic);
    formData.set("vegFriendly", String(values.vegFriendly));
    formData.set("nonVegFriendly", String(values.nonVegFriendly));
    formData.set("texture", values.texture);
    formData.set("tasteProfile", values.tasteProfile);
    formData.set("keyIngredients", values.keyIngredients);
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
            <IconInput icon={UtensilsCrossed} id="item-name" required value={values.name} onChange={(e) => setField("name", e.target.value)} />
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
            <Label htmlFor="item-food-type">Veg / Non-Veg</Label>
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
            <IconInput
              icon={IndianRupee}
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

      <div className="flex flex-col gap-4 rounded-md border border-border p-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold">Additional Details</span>
          <p className="text-xs text-muted-foreground">
            Optional — only shown on the customer-facing menu once it&apos;s filled in.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="item-origin">Origin</Label>
            <Select
              items={Object.fromEntries(ORIGIN_OPTIONS.map((o) => [o.value, o.label]))}
              value={values.origin}
              onValueChange={(v) => setField("origin", v ?? "")}
            >
              <SelectTrigger id="item-origin" className="w-full">
                <SelectValue placeholder="Not specified" />
              </SelectTrigger>
              <SelectContent>
                {ORIGIN_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="item-base-type">Base Type</Label>
            <Select
              items={Object.fromEntries(BASE_TYPE_OPTIONS.map((o) => [o.value, o.label]))}
              value={values.baseType}
              onValueChange={(v) => setField("baseType", v ?? "")}
            >
              <SelectTrigger id="item-base-type" className="w-full">
                <SelectValue placeholder="Not specified" />
              </SelectTrigger>
              <SelectContent>
                {BASE_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="item-preparation-method">Preparation Method</Label>
            <Select
              items={Object.fromEntries(PREPARATION_METHOD_OPTIONS.map((o) => [o.value, o.label]))}
              value={values.preparationMethod}
              onValueChange={(v) => setField("preparationMethod", v ?? "")}
            >
              <SelectTrigger id="item-preparation-method" className="w-full">
                <SelectValue placeholder="Not specified" />
              </SelectTrigger>
              <SelectContent>
                {PREPARATION_METHOD_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="item-spice-level">Spice Level</Label>
            <Select
              items={Object.fromEntries(SPICE_LEVEL_OPTIONS.map((o) => [o.value, o.label]))}
              value={values.spiceLevel}
              onValueChange={(v) => setField("spiceLevel", v ?? "")}
            >
              <SelectTrigger id="item-spice-level" className="w-full">
                <SelectValue placeholder="Not specified" />
              </SelectTrigger>
              <SelectContent>
                {SPICE_LEVEL_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="item-onion-garlic">Onion / Garlic</Label>
            <Select
              items={Object.fromEntries(ONION_GARLIC_OPTIONS.map((o) => [o.value, o.label]))}
              value={values.onionGarlic}
              onValueChange={(v) => setField("onionGarlic", v ?? "")}
            >
              <SelectTrigger id="item-onion-garlic" className="w-full">
                <SelectValue placeholder="Not specified" />
              </SelectTrigger>
              <SelectContent>
                {ONION_GARLIC_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="item-texture">Texture</Label>
            <Select
              items={Object.fromEntries(TEXTURE_OPTIONS.map((o) => [o.value, o.label]))}
              value={values.texture}
              onValueChange={(v) => setField("texture", v ?? "")}
            >
              <SelectTrigger id="item-texture" className="w-full">
                <SelectValue placeholder="Not specified" />
              </SelectTrigger>
              <SelectContent>
                {TEXTURE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="item-taste-profile">Taste Profile</Label>
            <Select
              items={Object.fromEntries(TASTE_PROFILE_OPTIONS.map((o) => [o.value, o.label]))}
              value={values.tasteProfile}
              onValueChange={(v) => setField("tasteProfile", v ?? "")}
            >
              <SelectTrigger id="item-taste-profile" className="w-full">
                <SelectValue placeholder="Not specified" />
              </SelectTrigger>
              <SelectContent>
                {TASTE_PROFILE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="item-key-ingredients">Key Ingredients</Label>
            <Input
              id="item-key-ingredients"
              placeholder="e.g. Paneer, Tomato, Cashew"
              value={values.keyIngredients}
              onChange={(e) => setField("keyIngredients", e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <label htmlFor="item-veg-friendly" className="flex w-fit cursor-pointer items-center gap-2">
            <Checkbox
              id="item-veg-friendly"
              checked={values.vegFriendly}
              onCheckedChange={(checked) => setField("vegFriendly", checked === true)}
            />
            <span className="text-sm font-medium">Veg Friendly</span>
          </label>
          <label htmlFor="item-nonveg-friendly" className="flex w-fit cursor-pointer items-center gap-2">
            <Checkbox
              id="item-nonveg-friendly"
              checked={values.nonVegFriendly}
              onCheckedChange={(checked) => setField("nonVegFriendly", checked === true)}
            />
            <span className="text-sm font-medium">Non-Veg Friendly</span>
          </label>
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
