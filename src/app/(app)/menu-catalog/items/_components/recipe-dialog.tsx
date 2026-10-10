"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { DrawerForm, FormDrawer } from "@/components/catalog/form-drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { costPerServing, scaleQuantity, type RecipeLine } from "@/modules/recipes/recipe-math";
import { deleteRecipeAction, saveRecipeAction } from "../actions";

export interface RecipeFormValues {
  yieldServings: string;
  notes: string;
  ingredients: { inventoryId: string; quantity: string }[];
}

export interface IngredientOption {
  id: string;
  name: string;
  unit: string;
  costPerUnit: number | null;
}

/** Another dish's recipe, offered as a starting point: its quantities are copied into the form, not saved. */
export interface CopySource {
  id: string;
  name: string;
  recipe: RecipeFormValues;
}

interface RecipeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  name: string;
  initialValues: RecipeFormValues | null;
  options: IngredientOption[];
  /** Dishes that already have a recipe. When given, "Copy from another dish" fills the form from one of them. */
  copySources?: CopySource[];
}

const EMPTY: RecipeFormValues = { yieldServings: "10", notes: "", ingredients: [{ inventoryId: "", quantity: "" }] };

/** The recipe (ingredient list) for one Food Item: quantities for a stated number of servings, with a scale-up preview. */
export function RecipeDialog({ open, onOpenChange, itemId, name, initialValues, options, copySources = [] }: RecipeDialogProps) {
  const router = useRouter();
  const [values, setValues] = useState<RecipeFormValues>(initialValues ?? EMPTY);
  const [previewServings, setPreviewServings] = useState("100");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [copiedFrom, setCopiedFrom] = useState<string | null>(null);

  const optionById = new Map(options.map((o) => [o.id, o]));
  const yieldNumber = Number.parseFloat(values.yieldServings);
  const previewNumber = Number.parseFloat(previewServings);
  const lines: RecipeLine[] = values.ingredients.flatMap((row) => {
    const option = optionById.get(row.inventoryId);
    const quantity = Number.parseFloat(row.quantity);
    return option && quantity > 0 ? [{ inventoryId: option.id, name: option.name, unit: option.unit, quantity, costPerUnit: option.costPerUnit }] : [];
  });
  const canPreview = yieldNumber > 0 && previewNumber >= 0 && lines.length > 0;
  const perServing = yieldNumber > 0 ? costPerServing(lines, yieldNumber) : null;

  function setRow(index: number, patch: Partial<RecipeFormValues["ingredients"][number]>) {
    setValues((v) => ({ ...v, ingredients: v.ingredients.map((row, i) => (i === index ? { ...row, ...patch } : row)) }));
  }

  /** Fills the form from another dish's recipe; nothing is saved until "Save recipe", so the quantities can be adjusted first. */
  function copyFrom(sourceId: string) {
    const source = copySources.find((s) => s.id === sourceId);
    if (!source) return;
    setValues({
      yieldServings: source.recipe.yieldServings,
      notes: source.recipe.notes,
      ingredients: source.recipe.ingredients.length ? source.recipe.ingredients.map((r) => ({ ...r })) : EMPTY.ingredients,
    });
    setCopiedFrom(source.name);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const result = await saveRecipeAction(itemId, {
      yieldServings: yieldNumber,
      notes: values.notes.trim() || undefined,
      ingredients: values.ingredients.filter((r) => r.inventoryId).map((r) => ({ inventoryId: r.inventoryId, quantity: Number.parseFloat(r.quantity) })),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onOpenChange(false);
    router.refresh();
  }

  async function handleRemove() {
    setError(null);
    setPending(true);
    const result = await deleteRecipeAction(itemId);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setValues(EMPTY);
    onOpenChange(false);
    router.refresh();
  }

  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title={`Recipe — ${name}`} description="What goes into this dish. Quantities are for the number of servings below." size="lg">
      <DrawerForm onSubmit={handleSubmit} error={error} pending={pending} submitLabel="Save recipe" onCancel={() => onOpenChange(false)}>
        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add items to Inventory first. Ingredients are picked from there.</p>
        ) : (
          <>
            {copySources.length > 0 && (
              <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted p-3">
                <Label>Copy from another dish</Label>
                <SearchableSelect
                  aria-label="Copy from another dish"
                  placeholder="Search a dish that already has a recipe"
                  searchPlaceholder="Search dishes with a recipe…"
                  emptyLabel="No dish with a recipe matches."
                  options={copySources.map((s) => ({ value: s.id, label: s.name }))}
                  value=""
                  onValueChange={copyFrom}
                />
                <p className="text-xs text-muted-foreground">
                  {copiedFrom ? `Copied from ${copiedFrom}. Adjust the quantities below, then save.` : "Start from a similar dish, then change the quantities. Nothing is saved until you press Save recipe."}
                </p>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="recipe-yield">These quantities make (servings)</Label>
              <Input id="recipe-yield" type="number" min="0" step="0.01" required value={values.yieldServings} onChange={(e) => setValues((v) => ({ ...v, yieldServings: e.target.value }))} />
            </div>

            <div className="flex flex-col gap-3">
              <Label>Ingredients</Label>
              {values.ingredients.map((row, index) => {
                const unit = optionById.get(row.inventoryId)?.unit;
                return (
                  <div key={index} className="flex items-end gap-2">
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <SearchableSelect
                        aria-label={`Ingredient ${index + 1}`}
                        placeholder="Search an inventory item"
                        searchPlaceholder="Search ingredients…"
                        emptyLabel="No inventory item matches."
                        options={options
                          .filter((o) => o.id === row.inventoryId || !values.ingredients.some((r) => r.inventoryId === o.id))
                          .map((o) => ({ value: o.id, label: o.name, hint: o.unit }))}
                        value={row.inventoryId}
                        onValueChange={(v) => setRow(index, { inventoryId: v })}
                      />
                    </div>
                    <div className="flex w-36 flex-col gap-1.5">
                      <Input aria-label={`Quantity ${index + 1}`} type="number" min="0" step="0.001" placeholder={unit ? `Qty (${unit})` : "Qty"} value={row.quantity} onChange={(e) => setRow(index, { quantity: e.target.value })} />
                    </div>
                    <Button type="button" variant="ghost" size="icon" aria-label={`Remove row ${index + 1}`} onClick={() => setValues((v) => ({ ...v, ingredients: v.ingredients.length > 1 ? v.ingredients.filter((_, i) => i !== index) : [{ inventoryId: "", quantity: "" }] }))}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                );
              })}
              <Button type="button" variant="outline" className="self-start" onClick={() => setValues((v) => ({ ...v, ingredients: [...v.ingredients, { inventoryId: "", quantity: "" }] }))}>
                <Plus /> Add ingredient
              </Button>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="recipe-notes">Notes</Label>
              <Textarea id="recipe-notes" value={values.notes} onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))} />
            </div>

            <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted p-4">
              <div className="flex items-center gap-2">
                <Label htmlFor="recipe-preview">Preview for</Label>
                <Input id="recipe-preview" className="w-24" type="number" min="0" value={previewServings} onChange={(e) => setPreviewServings(e.target.value)} />
                <span className="text-sm text-muted-foreground">servings</span>
              </div>
              {canPreview ? (
                <ul className="text-sm">
                  {lines.map((l) => (
                    <li key={l.inventoryId} className="flex justify-between">
                      <span>{l.name}</span>
                      <span className="font-medium">
                        {scaleQuantity(l.quantity, yieldNumber, previewNumber)} {l.unit}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Fill in the servings and at least one ingredient to see the scaled amounts.</p>
              )}
              <p className="text-sm text-muted-foreground">
                Ingredient cost per serving: <span className="font-medium text-foreground">{perServing === null ? "needs a cost on every ingredient" : `₹${perServing.toFixed(2)}`}</span>
              </p>
            </div>

            {initialValues && (
              <Button type="button" variant="outline" className="self-start text-destructive" disabled={pending} onClick={handleRemove}>
                <Trash2 /> Remove recipe
              </Button>
            )}
          </>
        )}
      </DrawerForm>
    </FormDrawer>
  );
}
