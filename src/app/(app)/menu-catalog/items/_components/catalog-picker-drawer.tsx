"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { FormDrawer, DrawerForm } from "@/components/catalog/form-drawer";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { addCatalogItemsAction, type BulkActionResult } from "../actions";
import { BulkResult } from "./bulk-result";

export interface CatalogOption {
  id: string;
  name: string;
  description: string | null;
  foodType: "VEGETARIAN" | "NON_VEGETARIAN";
  categoryName: string;
  image: string | null;
  alreadyAdded: boolean;
}

type FoodFilter = "ALL" | "VEGETARIAN" | "NON_VEGETARIAN";
const FOOD_FILTERS: { value: FoodFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "VEGETARIAN", label: "Veg" },
  { value: "NON_VEGETARIAN", label: "Non-Veg" },
];

export function CatalogPickerDrawer({ open, onClose, catalog }: { open: boolean; onClose: () => void; catalog: CatalogOption[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ALL");
  const [foodType, setFoodType] = useState<FoodFilter>("ALL");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<BulkActionResult, { ok: true }> | null>(null);

  const categories = useMemo(() => [...new Set(catalog.map((c) => c.categoryName))].sort(), [catalog]);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.filter(
      (c) => (category === "ALL" || c.categoryName === category) && (foodType === "ALL" || c.foodType === foodType) && (!q || c.name.toLowerCase().includes(q)),
    );
  }, [catalog, search, category, foodType]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function handleClose() {
    setSelected(new Set());
    setResult(null);
    setError(null);
    onClose();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (result) return handleClose();
    setPending(true);
    setError(null);
    const outcome = await addCatalogItemsAction([...selected]);
    setPending(false);
    if (!outcome.ok) return setError(outcome.error);
    setResult(outcome);
    router.refresh();
  }

  return (
    <FormDrawer open={open} onOpenChange={(o) => !o && handleClose()} title="Platterly Catalog" description="Common catering dishes. Each one you add becomes your own Food Item, with its own price." size="lg">
      <DrawerForm
        onSubmit={submit}
        error={error}
        pending={pending}
        submitLabel={result ? "Done" : `Add selected items${selected.size ? ` (${selected.size})` : ""}`}
        onCancel={handleClose}
      >
        {result ? (
          <BulkResult result={result} />
        ) : catalog.length === 0 ? (
          <p className="text-sm text-muted-foreground">The catalog has no dishes yet.</p>
        ) : (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search dishes…" className="pl-9" aria-label="Search dishes" />
            </div>
            <div className="flex flex-wrap gap-2">
              {["ALL", ...categories].map((c) => (
                <Button key={c} type="button" size="sm" variant={category === c ? "default" : "outline"} onClick={() => setCategory(c)}>
                  {c === "ALL" ? "All categories" : c}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {FOOD_FILTERS.map((f) => (
                <Button key={f.value} type="button" size="sm" variant={foodType === f.value ? "default" : "outline"} onClick={() => setFoodType(f.value)}>
                  {f.label}
                </Button>
              ))}
            </div>
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {visible.map((c) => (
                <li key={c.id}>
                  <label className={`flex items-start gap-3 p-3 ${c.alreadyAdded ? "opacity-60" : "cursor-pointer"}`}>
                    <Checkbox checked={c.alreadyAdded || selected.has(c.id)} disabled={c.alreadyAdded} onCheckedChange={() => toggle(c.id)} className="mt-0.5" />
                    {c.image && (
                      // eslint-disable-next-line @next/next/no-img-element -- static files under /catalog, same plain-img rule as the catalog cards
                      <img src={c.image} alt="" loading="lazy" className="aspect-video w-20 shrink-0 rounded-md object-cover" />
                    )}
                    <span className="flex flex-1 flex-col gap-0.5">
                      <span className="text-sm font-medium">{c.name}</span>
                      <span className="text-xs text-muted-foreground">{c.description ?? c.categoryName}</span>
                    </span>
                    <Badge variant={c.foodType === "VEGETARIAN" ? "success" : "danger"}>{c.foodType === "VEGETARIAN" ? "Veg" : "Non-Veg"}</Badge>
                    {c.alreadyAdded && <Badge variant="neutral">Added</Badge>}
                  </label>
                </li>
              ))}
              {visible.length === 0 && <li className="p-4 text-sm text-muted-foreground">No dishes match.</li>}
            </ul>
          </>
        )}
      </DrawerForm>
    </FormDrawer>
  );
}
