"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DrawerForm, FormDrawer, useIsDirty } from "@/components/catalog/form-drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { enterableUnits, friendlyQuantity, toStockUnit } from "@/modules/recipes/recipe-math";
import { costRecipe } from "@/modules/recipes/recipe-cost-math";
import type { PlanBatch } from "@/modules/inventory/fifo-plan";
import { UNIT_OPTIONS } from "@/modules/inventory/options";
import { createRecipeIngredientAction, deleteRecipeAction, saveRecipeAction } from "../actions";

export interface RecipeFormValues {
  yieldServings: string;
  notes: string;
  /** `unit` is the unit the quantity was typed in (g for a kg item); absent means the item's stock unit. */
  ingredients: { inventoryId: string; quantity: string; unit?: string }[];
}

export interface IngredientOption {
  id: string;
  name: string;
  unit: string;
  /** The item's own cost per unit: only for the separate estimate, never for the verified cost. */
  itemCost: number | null;
  /** The usable stock in the order it would be used (unbatched first, then batches oldest first), for the cost preview. */
  queue: PlanBatch[];
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

/** The recipe (ingredient list) for one Food Item: quantities for a stated number of servings. */
export function RecipeDialog({ open, onOpenChange, itemId, name, initialValues, options, copySources = [] }: RecipeDialogProps) {
  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title={`Recipe — ${name}`} description="What goes into this dish. Quantities are for the number of servings below." size="lg">
      <RecipeForm onOpenChange={onOpenChange} itemId={itemId} initialValues={initialValues} options={options} copySources={copySources} />
    </FormDrawer>
  );
}

// The form lives inside the drawer so its state starts fresh every time the drawer opens (and a discard really discards).
function RecipeForm({ onOpenChange, itemId, initialValues, options, copySources }: Pick<RecipeDialogProps, "onOpenChange" | "itemId" | "initialValues" | "options"> & { copySources: CopySource[] }) {
  const router = useRouter();
  const [extraOptions, setExtraOptions] = useState<IngredientOption[]>([]);
  const allOptions = [...options, ...extraOptions];
  const optionById = new Map(allOptions.map((o) => [o.id, o]));
  // Stored quantities are in the stock unit; show 0.7 kg as 700 g, the way a cook says it.
  const readable = (v: RecipeFormValues): RecipeFormValues => ({
    ...v,
    ingredients: v.ingredients.map((r) => {
      const stock = optionById.get(r.inventoryId)?.unit;
      const q = Number.parseFloat(r.quantity);
      if (!stock || r.unit || !(q > 0)) return r;
      const f = friendlyQuantity(q, stock);
      return f.unit === stock ? r : { ...r, quantity: String(f.quantity), unit: f.unit };
    }),
  });
  const [values, setValues] = useState<RecipeFormValues>(() => readable(initialValues ?? EMPTY));
  const [creating, setCreating] = useState<{ index: number; name: string; unit: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [copiedFrom, setCopiedFrom] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const dirty = useIsDirty({ values });

  const yieldNumber = Number.parseFloat(values.yieldServings);
  // The same FIFO rule as real consumption, run on the stock as it is now: nothing is deducted by looking at the cost.
  const cost = costRecipe(
    values.ingredients.flatMap((row) => {
      const option = optionById.get(row.inventoryId);
      const quantity = Number.parseFloat(row.quantity);
      return option && quantity > 0 ? [{ inventoryId: option.id, name: option.name, unit: option.unit, quantity: toStockUnit(quantity, row.unit ?? option.unit, option.unit), queue: option.queue, itemCost: option.itemCost }] : [];
    }),
    yieldNumber > 0 ? yieldNumber : 0,
  );

  function setRow(index: number, patch: Partial<RecipeFormValues["ingredients"][number]>) {
    setValues((v) => ({ ...v, ingredients: v.ingredients.map((row, i) => (i === index ? { ...row, ...patch } : row)) }));
  }

  /** Fills the form from another dish's recipe; nothing is saved until "Save recipe", so the quantities can be adjusted first. */
  function copyFrom(sourceId: string) {
    const source = copySources.find((s) => s.id === sourceId);
    if (!source) return;
    setValues(readable({
      yieldServings: source.recipe.yieldServings,
      notes: source.recipe.notes,
      ingredients: source.recipe.ingredients.length ? source.recipe.ingredients.map((r) => ({ ...r })) : EMPTY.ingredients,
    }));
    setCopiedFrom(source.name);
  }

  async function addNewIngredient() {
    if (!creating) return;
    setError(null);
    setPending(true);
    const result = await createRecipeIngredientAction(creating.name, creating.unit);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setExtraOptions((list) => [...list, { id: result.id, name: result.name, unit: result.unit, itemCost: null, queue: [] }]);
    setRow(creating.index, { inventoryId: result.id, unit: result.unit });
    setCreating(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const result = await saveRecipeAction(itemId, {
      yieldServings: yieldNumber,
      notes: values.notes.trim() || undefined,
      ingredients: values.ingredients
        .filter((r) => r.inventoryId)
        .map((r) => {
          const stock = optionById.get(r.inventoryId)?.unit ?? r.unit ?? "";
          return { inventoryId: r.inventoryId, quantity: toStockUnit(Number.parseFloat(r.quantity), r.unit ?? stock, stock) };
        }),
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
    setConfirmRemove(false);
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
    <>
      <DrawerForm dirty={dirty} onSubmit={handleSubmit} error={error} pending={pending} submitLabel="Save recipe" onCancel={() => onOpenChange(false)}>
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
                const stockUnit = optionById.get(row.inventoryId)?.unit;
                const unit = row.unit ?? stockUnit;
                const units = stockUnit ? enterableUnits(stockUnit) : [];
                return (
                  <div key={index} className="flex items-end gap-2">
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <SearchableSelect
                        aria-label={`Ingredient ${index + 1}`}
                        placeholder="Search an inventory item"
                        searchPlaceholder="Search ingredients…"
                        emptyLabel="No inventory item matches."
                        onCreate={(typed) => setCreating({ index, name: typed, unit: "kg" })}
                        options={allOptions
                          .filter((o) => o.id === row.inventoryId || !values.ingredients.some((r) => r.inventoryId === o.id))
                          .map((o) => ({ value: o.id, label: o.name, hint: o.unit }))}
                        value={row.inventoryId}
                        onValueChange={(v) => setRow(index, { inventoryId: v, unit: undefined })}
                      />
                    </div>
                    <div className="flex w-36 flex-col gap-1.5">
                      <Input aria-label={`Quantity ${index + 1}`} type="number" min="0" step="0.001" placeholder="Qty" value={row.quantity} onChange={(e) => setRow(index, { quantity: e.target.value })} />
                    </div>
                    <div className="flex w-24 flex-col gap-1.5">
                      {units.length > 1 ? (
                        <Select items={Object.fromEntries(units.map((u) => [u, u]))} value={unit} onValueChange={(v) => setRow(index, { unit: v ?? stockUnit })}>
                          <SelectTrigger aria-label={`Unit ${index + 1}`} className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {units.map((u) => (
                              <SelectItem key={u} value={u}>
                                {u}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span aria-label={`Unit ${index + 1}`} className="flex h-10 items-center px-1 text-sm text-muted-foreground">{unit ?? "unit"}</span>
                      )}
                    </div>
                    <Button type="button" variant="ghost" size="icon" aria-label={`Remove row ${index + 1}`} onClick={() => setValues((v) => ({ ...v, ingredients: v.ingredients.length > 1 ? v.ingredients.filter((_, i) => i !== index) : [{ inventoryId: "", quantity: "" }] }))}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                );
              })}
              {creating && (
                <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted p-3">
                  <p className="text-sm font-medium">New ingredient: {creating.name}</p>
                  <p className="text-xs text-muted-foreground">It is added to Inventory with zero stock. Pick the unit you buy and stock it in.</p>
                  <div className="flex items-end gap-2">
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <Label htmlFor="recipe-new-unit">Stock unit</Label>
                      <Select items={Object.fromEntries(UNIT_OPTIONS.map((o) => [o.value, o.label]))} value={creating.unit} onValueChange={(v) => setCreating({ ...creating, unit: v ?? "kg" })}>
                        <SelectTrigger id="recipe-new-unit" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {UNIT_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button type="button" disabled={pending} onClick={addNewIngredient}>
                      Add ingredient to inventory
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setCreating(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
              <Button type="button" variant="outline" className="self-start" onClick={() => setValues((v) => ({ ...v, ingredients: [...v.ingredients, { inventoryId: "", quantity: "" }] }))}>
                <Plus /> Add ingredient
              </Button>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="recipe-notes">Notes</Label>
              <Textarea id="recipe-notes" value={values.notes} onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))} />
            </div>

            <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted p-4" data-testid="recipe-cost">
              {cost.state === "VERIFIED" ? (
                <p className="text-sm text-muted-foreground">
                  Ingredient cost per serving: <span className="font-medium text-foreground">₹{cost.verifiedCostPerServing!.toFixed(2)}</span> <span className="text-xs">(verified from batch costs)</span>
                </p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Ingredient cost per serving: <span className="font-medium text-foreground">incomplete</span>
                  </p>
                  {cost.ingredients.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Add ingredients and quantities to see the cost.</p>
                  ) : (
                    <ul className="flex list-disc flex-col gap-0.5 pl-5 text-xs text-muted-foreground">
                      {cost.issues.map((issue) => (
                        <li key={issue.inventoryId}>
                          {issue.name}: {issue.reason}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-xs text-muted-foreground" data-testid="recipe-cost-estimate">
                    {cost.estimatedCostPerServing !== null ? (
                      <>
                        Estimated: <span className="font-medium text-foreground">₹{cost.estimatedCostPerServing.toFixed(2)}</span> (values stock with no known cost at the item&apos;s own cost; not a verified cost)
                      </>
                    ) : (
                      "Estimate unavailable (an ingredient has no known cost and no item cost to estimate from)."
                    )}
                  </p>
                </>
              )}
              <p className="text-xs text-muted-foreground">A preview against the stock as it is now: nothing is reserved or deducted, and each recipe is previewed on its own.</p>
            </div>

            {initialValues && (
              <Button type="button" variant="outline" className="self-start text-destructive" disabled={pending} onClick={() => setConfirmRemove(true)}>
                <Trash2 /> Remove recipe
              </Button>
            )}
        </>
      </DrawerForm>
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Remove this recipe?"
        description="The ingredient list for this dish is deleted. The dish itself stays."
        confirmLabel="Remove recipe"
        onConfirm={handleRemove}
      />
    </>
  );
}
