"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ActionResult } from "../actions";

const FOOD_TYPE_OPTIONS = [
  { value: "VEGETARIAN", label: "Vegetarian" },
  { value: "NON_VEGETARIAN", label: "Non-Vegetarian" },
] as const;

interface CategoryAssignmentRow {
  categoryId: string;
  checked: boolean;
  maxSelection: string;
  sortOrder: string;
}

export interface MenuFormValues {
  name: string;
  description: string;
  imageUrl: string | null;
  menuType: string;
  pricePerPlate: string;
  isActive: boolean;
  itemIds: string[];
  categoryAssignments: CategoryAssignmentRow[];
}

export const EMPTY_MENU_VALUES: Omit<MenuFormValues, "categoryAssignments"> = {
  name: "",
  description: "",
  imageUrl: null,
  menuType: "VEGETARIAN",
  pricePerPlate: "",
  isActive: true,
  itemIds: [],
};

export function emptyCategoryAssignments(categories: { id: string }[]): CategoryAssignmentRow[] {
  return categories.map((c) => ({ categoryId: c.id, checked: false, maxSelection: "", sortOrder: "0" }));
}

interface MenuFormProps {
  initialValues?: Partial<MenuFormValues>;
  availableItems: { id: string; name: string }[];
  availableCategories: { id: string; name: string }[];
  onSubmit: (formData: FormData) => Promise<ActionResult>;
  onSuccess: () => void;
  submitLabel: string;
}

export function MenuForm({
  initialValues,
  availableItems,
  availableCategories,
  onSubmit,
  onSuccess,
  submitLabel,
}: MenuFormProps) {
  const [values, setValues] = useState<MenuFormValues>({
    ...EMPTY_MENU_VALUES,
    categoryAssignments: emptyCategoryAssignments(availableCategories),
    ...initialValues,
  });
  const [image, setImage] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function setField<K extends keyof MenuFormValues>(key: K, value: MenuFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function toggleItem(itemId: string, checked: boolean) {
    setField("itemIds", checked ? [...values.itemIds, itemId] : values.itemIds.filter((id) => id !== itemId));
  }

  function updateAssignment(categoryId: string, patch: Partial<CategoryAssignmentRow>) {
    setField(
      "categoryAssignments",
      values.categoryAssignments.map((row) => (row.categoryId === categoryId ? { ...row, ...patch } : row)),
    );
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
    for (const itemId of values.itemIds) formData.append("itemIds", itemId);
    const assignments = values.categoryAssignments
      .filter((row) => row.checked)
      .map((row) => ({
        categoryId: row.categoryId,
        maxSelection: row.maxSelection.trim() === "" ? null : Number.parseInt(row.maxSelection, 10),
        sortOrder: row.sortOrder.trim() === "" ? 0 : Number.parseInt(row.sortOrder, 10),
      }));
    formData.set("categoryAssignments", JSON.stringify(assignments));

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
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="menu-name">Menu Name</Label>
        <Input id="menu-name" required value={values.name} onChange={(e) => setField("name", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="menu-description">Menu Description</Label>
        <Textarea id="menu-description" value={values.description} onChange={(e) => setField("description", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="menu-image">Menu Image (PNG or JPG, up to 2MB)</Label>
        {values.imageUrl && !image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={values.imageUrl} alt="" className="size-16 rounded-lg border border-border object-cover" />
        )}
        <input id="menu-image" type="file" accept="image/png,image/jpeg" onChange={(e) => setImage(e.target.files?.[0] ?? null)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
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
      </div>

      <label htmlFor="menu-active" className="flex w-fit cursor-pointer items-center gap-2">
        <Checkbox
          id="menu-active"
          checked={values.isActive}
          onCheckedChange={(checked) => setField("isActive", checked === true)}
        />
        <span className="text-sm font-medium">Active</span>
      </label>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <Label>Categories in this menu</Label>
        <p className="text-xs text-muted-foreground">
          Check a category, then set how many items a customer may choose from it on this menu (blank = unlimited)
          and its display position.
        </p>
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          {values.categoryAssignments.map((row) => {
            const category = availableCategories.find((c) => c.id === row.categoryId);
            if (!category) return null;
            return (
              <div key={row.categoryId} className="flex flex-wrap items-center gap-2 border-b border-border/50 pb-2 last:border-0 last:pb-0">
                <label htmlFor={`menu-category-${row.categoryId}`} className="flex min-w-40 flex-1 cursor-pointer items-center gap-2">
                  <Checkbox
                    id={`menu-category-${row.categoryId}`}
                    checked={row.checked}
                    onCheckedChange={(checked) => updateAssignment(row.categoryId, { checked: checked === true })}
                  />
                  <span className="text-sm">{category.name}</span>
                </label>
                {row.checked && (
                  <>
                    <Input
                      type="number"
                      min="0"
                      placeholder="Max selection"
                      className="w-36"
                      value={row.maxSelection}
                      onChange={(e) => updateAssignment(row.categoryId, { maxSelection: e.target.value })}
                    />
                    <Input
                      type="number"
                      min="0"
                      placeholder="Display order"
                      className="w-32"
                      value={row.sortOrder}
                      onChange={(e) => updateAssignment(row.categoryId, { sortOrder: e.target.value })}
                    />
                  </>
                )}
              </div>
            );
          })}
          {availableCategories.length === 0 && <p className="text-sm text-muted-foreground">No categories yet — add some first.</p>}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Items in this menu</Label>
        <div className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-md border border-border p-3">
          {availableItems.map((item) => (
            <label key={item.id} htmlFor={`menu-item-${item.id}`} className="flex cursor-pointer items-center gap-2 py-1">
              <Checkbox
                id={`menu-item-${item.id}`}
                checked={values.itemIds.includes(item.id)}
                onCheckedChange={(checked) => toggleItem(item.id, checked === true)}
              />
              <span className="text-sm">{item.name}</span>
            </label>
          ))}
          {availableItems.length === 0 && (
            <p className="text-sm text-muted-foreground">No active menu items yet — add some first.</p>
          )}
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
