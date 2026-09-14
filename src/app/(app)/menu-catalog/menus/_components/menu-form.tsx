"use client";

import { useState } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ImageDropzone } from "@/components/ui/image-dropzone";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ActionResult } from "../actions";

const FOOD_TYPE_OPTIONS = [
  { value: "VEGETARIAN", label: "Vegetarian" },
  { value: "NON_VEGETARIAN", label: "Non-Vegetarian" },
] as const;

export interface AssignedCategory {
  categoryId: string;
  name: string;
  maxSelection: number | null;
}

export interface MenuFormValues {
  name: string;
  description: string;
  imageUrl: string | null;
  menuType: string;
  pricePerPlate: string;
  isActive: boolean;
}

export const EMPTY_MENU_VALUES: MenuFormValues = {
  name: "",
  description: "",
  imageUrl: null,
  menuType: "VEGETARIAN",
  pricePerPlate: "",
  isActive: true,
};

interface MenuFormProps {
  initialValues?: Partial<MenuFormValues>;
  /**
   * Read-only — assigning a Category to this Menu happens from the
   * Category's own edit screen now (2026-09-14, AJ). This list only
   * displays what's already assigned (name + its max-selection) and lets
   * the caterer reorder it; undefined for a brand-new Menu (nothing
   * assigned yet — there's no `onReorderCategories` to call either).
   */
  assignedCategories?: AssignedCategory[];
  onReorderCategories?: (orderedCategoryIds: string[]) => Promise<ActionResult>;
  onSubmit: (formData: FormData) => Promise<ActionResult>;
  onSuccess: () => void;
  submitLabel: string;
}

export function MenuForm({
  initialValues,
  assignedCategories,
  onReorderCategories,
  onSubmit,
  onSuccess,
  submitLabel,
}: MenuFormProps) {
  const [values, setValues] = useState<MenuFormValues>({ ...EMPTY_MENU_VALUES, ...initialValues });
  const [image, setImage] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [categories, setCategories] = useState<AssignedCategory[]>(assignedCategories ?? []);
  const [reorderError, setReorderError] = useState<string | null>(null);

  function setField<K extends keyof MenuFormValues>(key: K, value: MenuFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function moveCategory(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= categories.length || !onReorderCategories) return;
    const reordered = [...categories];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(newIndex, 0, moved);

    const previous = categories;
    setCategories(reordered);
    setReorderError(null);
    const result = await onReorderCategories(reordered.map((c) => c.categoryId));
    if (!result.ok) {
      setReorderError(result.error);
      setCategories(previous);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("description", values.description);
    formData.set("menuType", values.menuType);
    formData.set("pricePerPlate", values.pricePerPlate);
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="menu-name">Menu Name</Label>
            <Input id="menu-name" required value={values.name} onChange={(e) => setField("name", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="menu-description">Menu Description</Label>
            <Textarea id="menu-description" value={values.description} onChange={(e) => setField("description", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="menu-image">Menu Image</Label>
            <ImageDropzone id="menu-image" value={values.imageUrl} onFileSelect={setImage} maxSizeMB={2} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="menu-price">Price Per Plate</Label>
            <Input
              id="menu-price"
              type="number"
              step="0.01"
              min="0"
              required
              value={values.pricePerPlate}
              onChange={(e) => setField("pricePerPlate", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="menu-type">Menu Type</Label>
            <Select value={values.menuType} onValueChange={(v) => setField("menuType", v ?? values.menuType)}>
              <SelectTrigger id="menu-type">
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
          <label htmlFor="menu-active" className="flex w-fit cursor-pointer items-center gap-2">
            <Checkbox
              id="menu-active"
              checked={values.isActive}
              onCheckedChange={(checked) => setField("isActive", checked === true)}
            />
            <span className="text-sm font-medium">Active</span>
          </label>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Categories in this menu</Label>
          <p className="text-xs text-muted-foreground">
            Assign categories to this menu from a Category&apos;s own edit screen — reorder them here.
          </p>
          {reorderError && (
            <p role="alert" className="text-sm text-destructive">
              {reorderError}
            </p>
          )}
          <div className="flex flex-col gap-1 rounded-md border border-border p-3">
            {categories.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No categories assigned yet — assign this menu from a Category&apos;s edit screen after creating it.
              </p>
            )}
            {categories.map((category, index) => (
              <div
                key={category.categoryId}
                className="flex items-center justify-between gap-2 border-b border-border/50 py-1.5 last:border-0"
              >
                <span className="text-sm">
                  {category.name}{" "}
                  <span className="text-muted-foreground">(max {category.maxSelection ?? "unlimited"})</span>
                </span>
                {onReorderCategories && (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Move ${category.name} up`}
                      disabled={index === 0}
                      onClick={() => moveCategory(index, -1)}
                    >
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Move ${category.name} down`}
                      disabled={index === categories.length - 1}
                      onClick={() => moveCategory(index, 1)}
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
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
