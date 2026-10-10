"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { FormDrawer, DrawerForm } from "@/components/catalog/form-drawer";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UNIT_OPTIONS } from "@/modules/inventory/options";
import { addIngredientsAction, type BulkActionResult } from "../actions";
import { BulkResult } from "./bulk-result";

export interface IngredientOption {
  id: string;
  name: string;
  categoryName: string;
  /** Platterly's suggested unit; the kitchen confirms or changes it. */
  unit: string;
  image: string;
  alreadyAdded: boolean;
}

const UNIT_ITEMS = Object.fromEntries(UNIT_OPTIONS.map((o) => [o.value, o.label]));

export function IngredientPickerDrawer({ open, onClose, catalog }: { open: boolean; onClose: () => void; catalog: IngredientOption[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ALL");
  const [selected, setSelected] = useState<Map<string, string>>(new Map()); // id -> chosen unit
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<BulkActionResult, { ok: true }> | null>(null);

  const categories = useMemo(() => [...new Set(catalog.map((c) => c.categoryName))].sort(), [catalog]);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.filter((c) => (category === "ALL" || c.categoryName === category) && (!q || c.name.toLowerCase().includes(q)));
  }, [catalog, search, category]);

  function toggle(item: IngredientOption) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (!next.delete(item.id)) next.set(item.id, item.unit);
      return next;
    });
  }
  function setUnit(id: string, unit: string) {
    setSelected((prev) => new Map(prev).set(id, unit));
  }
  function handleClose() {
    setSelected(new Map());
    setResult(null);
    setError(null);
    onClose();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (result) return handleClose();
    setPending(true);
    setError(null);
    const outcome = await addIngredientsAction([...selected].map(([id, unit]) => ({ id, unit })));
    setPending(false);
    if (!outcome.ok) return setError(outcome.error);
    setResult(outcome);
    router.refresh();
  }

  return (
    <FormDrawer
      open={open}
      onOpenChange={(o) => !o && handleClose()}
      title="Platterly Ingredient Catalog"
      description="Common ingredients. Each one you add becomes your own Inventory Item at zero stock, in the unit you choose."
      size="lg"
    >
      <DrawerForm
        onSubmit={submit}
        error={error}
        pending={pending}
        submitLabel={result ? "Done" : `Add selected ingredients${selected.size ? ` (${selected.size})` : ""}`}
        onCancel={handleClose}
      >
        {result ? (
          <BulkResult result={result} />
        ) : catalog.length === 0 ? (
          <p className="text-sm text-muted-foreground">The ingredient catalog has no items yet.</p>
        ) : (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ingredients…" className="pl-9" aria-label="Search ingredients" />
            </div>
            <div className="flex flex-wrap gap-2">
              {["ALL", ...categories].map((c) => (
                <Button key={c} type="button" size="sm" variant={category === c ? "default" : "outline"} onClick={() => setCategory(c)}>
                  {c === "ALL" ? "All categories" : c}
                </Button>
              ))}
            </div>
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {visible.map((c) => {
                const chosenUnit = selected.get(c.id);
                return (
                  <li key={c.id} className={`flex items-center gap-3 p-3 ${c.alreadyAdded ? "opacity-60" : ""}`}>
                    <Checkbox
                      aria-label={`Select ${c.name}`}
                      checked={c.alreadyAdded || chosenUnit !== undefined}
                      disabled={c.alreadyAdded}
                      onCheckedChange={() => toggle(c)}
                    />
                    {/* eslint-disable-next-line @next/next/no-img-element -- static files under /catalog, same plain-img rule as the catalog cards */}
                    <img src={c.image} alt="" loading="lazy" className="aspect-video w-16 shrink-0 rounded-md object-cover" />
                    <span className="flex flex-1 flex-col gap-0.5">
                      <span className="text-sm font-medium">{c.name}</span>
                      <span className="text-xs text-muted-foreground">{c.categoryName}</span>
                    </span>
                    {c.alreadyAdded ? (
                      <Badge variant="neutral">Added</Badge>
                    ) : (
                      <Select items={UNIT_ITEMS} value={chosenUnit ?? c.unit} onValueChange={(v) => v && setUnit(c.id, v)} disabled={chosenUnit === undefined}>
                        <SelectTrigger aria-label={`Unit for ${c.name}`} className="w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {UNIT_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </li>
                );
              })}
              {visible.length === 0 && <li className="p-4 text-sm text-muted-foreground">No ingredients match.</li>}
            </ul>
          </>
        )}
      </DrawerForm>
    </FormDrawer>
  );
}
