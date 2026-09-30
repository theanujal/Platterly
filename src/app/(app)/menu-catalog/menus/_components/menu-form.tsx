"use client";

import { useState } from "react";
import { ArrowUp, ArrowDown, BookOpen, IndianRupee, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconInput } from "@/components/ui/icon-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { DrawerForm } from "@/components/catalog/form-drawer";
import { ImageDropzone } from "@/components/ui/image-dropzone";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ActionResult } from "../actions";

const FOOD_TYPE_OPTIONS = [
  { value: "VEGETARIAN", label: "Vegetarian" },
  { value: "NON_VEGETARIAN", label: "Non-Vegetarian" },
] as const;

const CHILD_5_TO_10_PRICING_OPTIONS = [
  { value: "PERCENTAGE", label: "Percentage of Price Per Plate" },
  { value: "FIXED", label: "Fixed Price Per Plate" },
] as const;

export interface AssignedCategory {
  categoryId: string;
  name: string;
  maxSelection: number | null;
}

/** A category row in the drawer's right column; the max is kept as text while it is being typed. */
interface CategoryRow {
  categoryId: string;
  name: string;
  max: string;
}

export interface MenuFormValues {
  name: string;
  description: string;
  imageUrl: string | null;
  menuType: string;
  pricePerPlate: string;
  isActive: boolean;
  childUnder5Chargeable: boolean;
  childUnder5Price: string;
  child5To10PricingType: string;
  child5To10PriceValue: string;
}

export const EMPTY_MENU_VALUES: MenuFormValues = {
  name: "",
  description: "",
  imageUrl: null,
  menuType: "VEGETARIAN",
  pricePerPlate: "",
  isActive: true,
  childUnder5Chargeable: false,
  childUnder5Price: "",
  child5To10PricingType: "FIXED",
  child5To10PriceValue: "",
};

interface MenuFormProps {
  initialValues?: Partial<MenuFormValues>;
  /** Every category the caterer has — the right column picks from these. */
  categories: { id: string; name: string }[];
  /** This menu's current categories, in order (empty for a new menu). */
  assignedCategories?: AssignedCategory[];
  onSubmit: (formData: FormData) => Promise<ActionResult>;
  onSuccess: () => void;
  submitLabel: string;
  onCancel: () => void;
}

export function MenuForm({ initialValues, categories, assignedCategories, onSubmit, onSuccess, submitLabel, onCancel }: MenuFormProps) {
  const [values, setValues] = useState<MenuFormValues>({ ...EMPTY_MENU_VALUES, ...initialValues });
  const [image, setImage] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [rows, setRows] = useState<CategoryRow[]>(
    (assignedCategories ?? []).map((c) => ({ categoryId: c.categoryId, name: c.name, max: c.maxSelection?.toString() ?? "" })),
  );
  const available = categories.filter((c) => !rows.some((r) => r.categoryId === c.id));

  function setField<K extends keyof MenuFormValues>(key: K, value: MenuFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function moveCategory(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    setRows((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
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
    formData.set("childUnder5Chargeable", String(values.childUnder5Chargeable));
    formData.set("childUnder5Price", values.childUnder5Price);
    formData.set("child5To10PricingType", values.child5To10PricingType);
    formData.set("child5To10PriceValue", values.child5To10PriceValue);
    if (image) formData.set("image", image);
    for (const row of rows) {
      const max = Number.parseInt(row.max, 10);
      formData.append("categoryAssignment", JSON.stringify({ categoryId: row.categoryId, maxSelection: Number.isNaN(max) ? null : max }));
    }

    const result = await onSubmit(formData);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSuccess();
  }

  return (
    <DrawerForm
      onSubmit={handleSubmit}
      error={error}
      pending={pending}
      submitLabel={submitLabel}
      onCancel={onCancel}
      active={{ id: "menu-active", checked: values.isActive, onChange: (checked) => setField("isActive", checked), onLabel: "Active – customers can see it", offLabel: "Inactive – hidden from customers" }}
      className="grid grid-cols-1 gap-8 lg:grid-cols-2"
    >
      {/* Left: the menu's own details and pricing */}
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="menu-name">Menu Name</Label>
          <IconInput icon={BookOpen} id="menu-name" required value={values.name} onChange={(e) => setField("name", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="menu-description">Menu Description</Label>
          <Textarea id="menu-description" value={values.description} onChange={(e) => setField("description", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="menu-image">Menu Image</Label>
          <ImageDropzone id="menu-image" value={values.imageUrl} onFileSelect={setImage} maxSizeMB={4} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="menu-type">Menu Type</Label>
          <Select
            items={Object.fromEntries(FOOD_TYPE_OPTIONS.map((o) => [o.value, o.label]))}
            value={values.menuType}
            onValueChange={(v) => setField("menuType", v ?? values.menuType)}
          >
            <SelectTrigger id="menu-type" className="w-full">
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

        <div className="flex flex-col gap-4 rounded-md border border-border p-4">
          <span className="text-sm font-semibold">Pricing</span>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="menu-price">Price Per Plate</Label>
            <IconInput
              icon={IndianRupee}
              id="menu-price"
              type="number"
              step="0.01"
              min="0"
              required
              value={values.pricePerPlate}
              onChange={(e) => setField("pricePerPlate", e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <span className="text-sm font-semibold">Children Guests & Pricing</span>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-foreground">Below 5 years</span>
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">Complimentary</span>
              </div>
              <label htmlFor="menu-child-under5-chargeable" className="flex w-fit cursor-pointer items-center gap-2">
                <Checkbox
                  id="menu-child-under5-chargeable"
                  checked={values.childUnder5Chargeable}
                  onCheckedChange={(checked) => setField("childUnder5Chargeable", checked === true)}
                />
                <span className="text-sm font-medium">Charge for Below 5 years</span>
              </label>
            </div>
            {values.childUnder5Chargeable && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="menu-child-under5-price">Price per child (under 5)</Label>
                <Input
                  id="menu-child-under5-price"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={values.childUnder5Price}
                  onChange={(e) => setField("childUnder5Price", e.target.value)}
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="menu-child-5to10-type">5–10 Years Pricing</Label>
              <Select
                items={Object.fromEntries(CHILD_5_TO_10_PRICING_OPTIONS.map((o) => [o.value, o.label]))}
                value={values.child5To10PricingType}
                onValueChange={(v) => setField("child5To10PricingType", v ?? values.child5To10PricingType)}
              >
                <SelectTrigger id="menu-child-5to10-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHILD_5_TO_10_PRICING_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="menu-child-5to10-value">{values.child5To10PricingType === "PERCENTAGE" ? "Percentage (%)" : "Fixed Price"}</Label>
              <Input
                id="menu-child-5to10-value"
                type="number"
                step="0.01"
                min="0"
                max={values.child5To10PricingType === "PERCENTAGE" ? 100 : undefined}
                value={values.child5To10PriceValue}
                onChange={(e) => setField("child5To10PriceValue", e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Right: pick the categories, how many a guest may choose from each, and their order */}
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold">Categories in this menu</span>
          <p className="text-xs text-muted-foreground">
            Pick the categories this menu offers, set how many dishes a guest can choose from each (blank means no limit), and order them the way they should appear.
          </p>
        </div>

        <div className="flex flex-col gap-2" data-testid="menu-selected-categories">
          {rows.length === 0 && <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">No categories yet. Add some from the list below.</p>}
          {rows.map((row, index) => (
            <div key={row.categoryId} className="flex items-center gap-2 rounded-md border border-border p-2.5">
              <div className="flex shrink-0 flex-col">
                <Button type="button" variant="ghost" size="icon-xs" aria-label={`Move ${row.name} up`} disabled={index === 0} onClick={() => moveCategory(index, -1)}>
                  <ArrowUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Move ${row.name} down`}
                  disabled={index === rows.length - 1}
                  onClick={() => moveCategory(index, 1)}
                >
                  <ArrowDown />
                </Button>
              </div>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{row.name}</span>
              <Input
                type="number"
                min="1"
                step="1"
                placeholder="No limit"
                aria-label={`Max selection for ${row.name}`}
                className="w-28"
                value={row.max}
                onChange={(e) => setRows((prev) => prev.map((r) => (r.categoryId === row.categoryId ? { ...r, max: e.target.value } : r)))}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${row.name}`}
                onClick={() => setRows((prev) => prev.filter((r) => r.categoryId !== row.categoryId))}
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <span className="text-sm font-semibold">Available categories</span>
          {available.length === 0 ? (
            <p className="text-sm text-muted-foreground">{categories.length === 0 ? "No categories yet. Create some under Menu Categories." : "Every category is already in this menu."}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {available.map((c) => (
                <Button
                  key={c.id}
                  type="button"
                  variant="outline"
                  size="md"
                  aria-label={`Add ${c.name}`}
                  onClick={() => setRows((prev) => [...prev, { categoryId: c.id, name: c.name, max: "" }])}
                >
                  <Plus className="size-4" />
                  {c.name}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>
    </DrawerForm>
  );
}
