"use client";

import { useMemo, useState } from "react";
import { BookOpenText, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconInput } from "@/components/ui/icon-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupees } from "@/components/catalog/catalog-display";
import { RecipeDialog, type IngredientOption, type RecipeFormValues } from "@/app/(app)/menu-catalog/items/_components/recipe-dialog";
import { cn } from "cn";

export interface RecipeRow {
  id: string;
  name: string;
  category: string | null;
  hasRecipe: boolean;
  ingredientCount: number;
  yieldServings: number | null;
  costPerServing: number | null;
  recipe: RecipeFormValues | null;
}

type Filter = "ALL" | "MISSING" | "COMPLETE";

/** Every active dish with its recipe status. Search, filter by Missing / Complete, add or edit a recipe (the drawer can start from another dish's recipe). */
export function RecipesBrowser({ rows, ingredientOptions, canEdit }: { rows: RecipeRow[]; ingredientOptions: IngredientOption[]; canEdit: boolean }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [editing, setEditing] = useState<RecipeRow | null>(null);

  const missing = rows.filter((r) => !r.hasRecipe).length;
  const complete = rows.length - missing;
  const needle = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      rows.filter(
        (r) => (filter === "ALL" || (filter === "MISSING" ? !r.hasRecipe : r.hasRecipe)) && (needle === "" || `${r.name} ${r.category ?? ""}`.toLowerCase().includes(needle)),
      ),
    [rows, filter, needle],
  );
  // Dishes whose recipe can be copied into the open drawer (never the dish being edited).
  const copySources = rows.flatMap((r) => (r.recipe && r.id !== editing?.id ? [{ id: r.id, name: r.name, recipe: r.recipe }] : []));

  const FILTERS: { key: Filter; label: string; count: number }[] = [
    { key: "ALL", label: "All dishes", count: rows.length },
    { key: "MISSING", label: "Missing recipe", count: missing },
    { key: "COMPLETE", label: "Has recipe", count: complete },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-56 flex-1 sm:max-w-sm">
          <IconInput icon={Search} type="search" aria-label="Search dishes" placeholder="Search dishes…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div role="group" aria-label="Recipe status" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Button key={f.key} type="button" size="md" variant={filter === f.key ? "default" : "outline"} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label}
              <span className={cn("rounded-full px-1.5 text-xs", filter === f.key ? "bg-primary-foreground/20" : "bg-muted")}>{f.count}</span>
            </Button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">No active food items yet. Add dishes in the Menu Catalog first.</p>
      ) : visible.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">No dishes match.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dish</TableHead>
                <TableHead>Recipe</TableHead>
                <TableHead>Ingredients</TableHead>
                <TableHead>Makes</TableHead>
                <TableHead>Cost / serving</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((row) => (
                <TableRow key={row.id} data-testid="recipe-row">
                  <TableCell>
                    <span className="block font-medium">{row.name}</span>
                    {row.category && <span className="block text-xs text-muted-foreground">{row.category}</span>}
                  </TableCell>
                  <TableCell>{row.hasRecipe ? <Badge variant="success">Complete</Badge> : <Badge variant="warning">Missing</Badge>}</TableCell>
                  <TableCell>{row.hasRecipe ? row.ingredientCount : "—"}</TableCell>
                  <TableCell>{row.yieldServings !== null ? `${row.yieldServings} servings` : "—"}</TableCell>
                  <TableCell>{row.costPerServing !== null ? formatRupees(row.costPerServing) : "—"}</TableCell>
                  <TableCell className="text-right">
                    {canEdit && (
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant={row.hasRecipe ? "outline" : "default"} size="md" aria-label={`${row.hasRecipe ? "Edit" : "Add"} recipe for ${row.name}`} onClick={() => setEditing(row)}>
                          <BookOpenText /> {row.hasRecipe ? "Edit Recipe" : "Add Recipe"}
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {!canEdit && <p className="text-sm text-muted-foreground">You can see recipes here. Editing them needs permission to edit the menu.</p>}

      {editing && (
        <RecipeDialog
          key={editing.id + JSON.stringify(editing.recipe)}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          itemId={editing.id}
          name={editing.name}
          initialValues={editing.recipe}
          options={ingredientOptions}
          copySources={copySources}
        />
      )}
    </div>
  );
}
