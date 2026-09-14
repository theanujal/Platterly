"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import type { CategoryInput } from "@/modules/menus/category";
import type { ActionResult } from "../actions";

interface MenuAssignmentRow {
  menuId: string;
  checked: boolean;
  maxSelection: string;
}

export interface CategoryFormValues {
  name: string;
  description: string;
  isActive: boolean;
  menuAssignments: MenuAssignmentRow[];
}

export const EMPTY_CATEGORY_VALUES: Omit<CategoryFormValues, "menuAssignments"> = {
  name: "",
  description: "",
  isActive: true,
};

export function emptyMenuAssignments(menus: { id: string }[]): MenuAssignmentRow[] {
  return menus.map((m) => ({ menuId: m.id, checked: false, maxSelection: "" }));
}

export function valuesToCategoryInput(values: CategoryFormValues): CategoryInput {
  return {
    name: values.name,
    description: values.description || undefined,
    isActive: values.isActive,
    menuAssignments: values.menuAssignments
      .filter((row) => row.checked)
      .map((row) => ({
        menuId: row.menuId,
        maxSelection: row.maxSelection.trim() === "" ? null : Number.parseInt(row.maxSelection, 10),
      })),
  };
}

interface CategoryFormProps {
  initialValues?: Partial<CategoryFormValues>;
  availableMenus: { id: string; name: string }[];
  onSubmit: (input: CategoryInput) => Promise<ActionResult>;
  onSuccess: () => void;
  submitLabel: string;
}

export function CategoryForm({ initialValues, availableMenus, onSubmit, onSuccess, submitLabel }: CategoryFormProps) {
  const [values, setValues] = useState<CategoryFormValues>({
    ...EMPTY_CATEGORY_VALUES,
    menuAssignments: emptyMenuAssignments(availableMenus),
    ...initialValues,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function setField<K extends keyof CategoryFormValues>(key: K, value: CategoryFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function updateAssignment(menuId: string, patch: Partial<MenuAssignmentRow>) {
    setField(
      "menuAssignments",
      values.menuAssignments.map((row) => (row.menuId === menuId ? { ...row, ...patch } : row)),
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const result = await onSubmit(valuesToCategoryInput(values));
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSuccess();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="category-name">Category Name</Label>
        <Input id="category-name" required value={values.name} onChange={(e) => setField("name", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="category-description">Category Description</Label>
        <Textarea
          id="category-description"
          value={values.description}
          onChange={(e) => setField("description", e.target.value)}
        />
      </div>
      <label htmlFor="category-active" className="flex w-fit cursor-pointer items-center gap-2">
        <Checkbox
          id="category-active"
          checked={values.isActive}
          onCheckedChange={(checked) => setField("isActive", checked === true)}
        />
        <span className="text-sm font-medium">Active</span>
      </label>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <Label>Assign to Menus</Label>
        <p className="text-xs text-muted-foreground">
          Check a Menu Type, then set how many items a customer may choose from this category on it (blank = unlimited).
        </p>
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          {values.menuAssignments.map((row) => {
            const menu = availableMenus.find((m) => m.id === row.menuId);
            if (!menu) return null;
            return (
              <div key={row.menuId} className="flex flex-wrap items-center gap-2 border-b border-border/50 pb-2 last:border-0 last:pb-0">
                <label htmlFor={`category-menu-${row.menuId}`} className="flex min-w-40 flex-1 cursor-pointer items-center gap-2">
                  <Checkbox
                    id={`category-menu-${row.menuId}`}
                    checked={row.checked}
                    onCheckedChange={(checked) => updateAssignment(row.menuId, { checked: checked === true })}
                  />
                  <span className="text-sm">{menu.name}</span>
                </label>
                {row.checked && (
                  <Input
                    type="number"
                    min="0"
                    placeholder="Max selection"
                    className="w-36"
                    value={row.maxSelection}
                    onChange={(e) => updateAssignment(row.menuId, { maxSelection: e.target.value })}
                  />
                )}
              </div>
            );
          })}
          {availableMenus.length === 0 && <p className="text-sm text-muted-foreground">No menu types yet — add one first.</p>}
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
