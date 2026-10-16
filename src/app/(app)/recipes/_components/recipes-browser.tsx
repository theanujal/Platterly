"use client";

import { useState } from "react";
import { BookOpenText, Plus, UtensilsCrossed } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell } from "@/components/ui/table";
import { CatalogBrowser, type CatalogEntry, type CatalogFilterOption, type CatalogSortOption } from "@/components/catalog/catalog-browser";
import { CATALOG_GRID_CLASSNAME, CatalogCardBody, CatalogCardMedia, CatalogNameCell, formatRupees } from "@/components/catalog/catalog-display";
import { RecipeDialog, type IngredientOption, type RecipeFormValues } from "@/app/(app)/menu-catalog/items/_components/recipe-dialog";

export interface RecipeRow {
  id: string;
  name: string;
  image: string | null;
  category: string | null;
  hasRecipe: boolean;
  /** Lifecycle: Draft until approved for production. Null without a recipe. Independent of the cost state below. */
  status: "DRAFT" | "ACTIVE" | null;
  ingredientCount: number;
  yieldServings: number | null;
  /** Null without a recipe. VERIFIED only when every ingredient's quantity is covered by batches with a known cost. */
  cost: { state: "VERIFIED" | "INCOMPLETE"; verified: number | null; estimate: number | null; issues: { name: string; reason: string }[] } | null;
  recipe: RecipeFormValues | null;
}

/** Cost per serving: the verified amount, or "Incomplete" with what is missing (and a separate Estimated figure), or a dash with no recipe. */
function CostCell({ row }: { row: RecipeRow }) {
  if (!row.cost) return <>—</>;
  if (row.cost.state === "VERIFIED") return <>{formatRupees(row.cost.verified!)}</>;
  return (
    <span className="flex flex-col gap-0.5 font-normal">
      <span className="text-muted-foreground" title={row.cost.issues.map((i) => `${i.name}: ${i.reason}`).join("\n")}>
        Incomplete
      </span>
      <span className="max-w-64 text-xs whitespace-normal text-muted-foreground" data-testid="cost-issues">
        {row.cost.issues.map((i) => i.name).join(", ")}
      </span>
      <span className="text-xs text-muted-foreground italic" data-testid="cost-estimate">
        {row.cost.estimate !== null ? `Estimated ${formatRupees(row.cost.estimate)}` : "Estimate unavailable"}
      </span>
    </span>
  );
}

type StatusFilter = "ALL" | "MISSING" | "DRAFT" | "ACTIVE" | "INCOMPLETE" | "HAS";

/** Cost state, apart from the lifecycle: Incomplete means the cost per serving cannot be verified from the stock batches. */
function costIncomplete(row: RecipeRow) {
  return row.hasRecipe && row.cost?.state !== "VERIFIED";
}

/** The recipe's lifecycle: Missing (no recipe), Draft (not approved for production) or Active (approved). Cost is shown in its own column. */
function StatusBadge({ row }: { row: RecipeRow }) {
  const [variant, label] = !row.hasRecipe ? (["warning", "Missing"] as const) : row.status === "ACTIVE" ? (["success", "Active"] as const) : (["info", "Draft"] as const);
  return (
    <Badge variant={variant}>
      <span className="size-1.5 rounded-full bg-current" />
      {label}
    </Badge>
  );
}

/** Every active dish with its recipe status, in the shared catalog list (search, category, status, sort, paging). Add or edit a recipe in the drawer, which can start from another dish's recipe. */
export function RecipesBrowser({ rows, ingredientOptions, canEdit }: { rows: RecipeRow[]; ingredientOptions: IngredientOption[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<RecipeRow | null>(null);
  const [picking, setPicking] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  // Dishes whose recipe can be copied into the open drawer (never the dish being edited).
  const copySources = rows.flatMap((r) => (r.recipe && r.id !== editing?.id ? [{ id: r.id, name: r.name, recipe: r.recipe }] : []));

  const counts = {
    ALL: rows.length,
    MISSING: rows.filter((r) => !r.hasRecipe).length,
    DRAFT: rows.filter((r) => r.status === "DRAFT").length,
    ACTIVE: rows.filter((r) => r.status === "ACTIVE").length,
    INCOMPLETE: rows.filter(costIncomplete).length,
    HAS: rows.filter((r) => r.hasRecipe).length,
  };
  const PILLS: { key: StatusFilter; label: string }[] = [
    { key: "ALL", label: "All Dishes" },
    { key: "MISSING", label: "Missing Recipe" },
    { key: "DRAFT", label: "Draft" },
    { key: "ACTIVE", label: "Active" },
    { key: "INCOMPLETE", label: "Cost Incomplete" },
    { key: "HAS", label: "Has Recipe" },
  ];
  // The recipe-status filter is a dropdown now, each choice with how many dishes it holds (AJ, 2026-10-17).
  const statusItems = Object.fromEntries(PILLS.map((p) => [p.key, `${p.label} (${counts[p.key]})`])) as Record<StatusFilter, string>;
  const shown = rows.filter((r) => statusFilter === "ALL" || (statusFilter === "HAS" ? r.hasRecipe : statusFilter === "MISSING" ? !r.hasRecipe : statusFilter === "INCOMPLETE" ? costIncomplete(r) : r.status === statusFilter));

  const entries: CatalogEntry[] = shown.map((row) => {
    const status = <StatusBadge row={row} />;
    const action = canEdit ? (
      <Button
        type="button"
        variant={row.hasRecipe ? "outline" : "default"}
        size="md"
        aria-label={`${row.hasRecipe ? "Edit" : "Add"} recipe for ${row.name}`}
        onClick={() => setEditing(row)}
      >
        <BookOpenText /> {row.hasRecipe ? "Edit Recipe" : "Add Recipe"}
      </Button>
    ) : null;
    return {
      id: row.id,
      searchText: `${row.name} ${row.category ?? ""}`,
      filterValues: { category: row.category ?? undefined },
      sortValues: { name: row.name, cost: row.cost?.verified ?? Number.MAX_SAFE_INTEGER },
      card: (
        <>
          <CatalogCardMedia src={row.image} icon={UtensilsCrossed} />
          <CatalogCardBody
            title={row.name}
            description={row.category}
            tags={action}
            footer={
              <span className="text-base font-semibold">
                <CostCell row={row} />
              </span>
            }
            statusBadge={status}
          />
        </>
      ),
      listRow: (
        <>
          <TableCell className="px-3 py-3">
            <CatalogNameCell name={row.name} src={row.image} icon={UtensilsCrossed} />
          </TableCell>
          <TableCell className="px-3 py-3">{row.category ? <Badge variant="outline">{row.category}</Badge> : "—"}</TableCell>
          <TableCell className="px-3 py-3">{status}</TableCell>
          <TableCell className="px-3 py-3 text-sm">{row.hasRecipe ? `${row.ingredientCount} ${row.ingredientCount === 1 ? "item" : "items"}` : "—"}</TableCell>
          <TableCell className="px-3 py-3 text-sm">{row.yieldServings !== null ? `${row.yieldServings} servings` : "—"}</TableCell>
          <TableCell className="px-3 py-3 text-sm font-semibold">
            <CostCell row={row} />
          </TableCell>
          <TableCell className="px-3 py-3">
            <div className="flex justify-end">{action}</div>
          </TableCell>
        </>
      ),
    };
  });

  const categories = [...new Set(rows.flatMap((r) => (r.category ? [r.category] : [])))].sort();
  const filterOptions: CatalogFilterOption[] = [{ key: "category", allLabel: "All Categories", options: categories.map((c) => ({ value: c, label: c })), className: "w-48" }];
  const sortOptions: CatalogSortOption[] = [
    { value: "name", label: "Name (A–Z)", key: "name" },
    { value: "cost-low", label: "Cost (Low–High)", key: "cost" },
    { value: "cost-high", label: "Cost (High–Low)", key: "cost", direction: "desc" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Recipes</h1>
          <p className="text-sm text-muted-foreground">Manage dish recipes, ingredient quantities, and cost per serving to support accurate stock planning.</p>
        </div>
        {canEdit && (
          <Button type="button" onClick={() => setPicking(true)}>
            <Plus /> Add Recipe
          </Button>
        )}
      </div>
      <CatalogBrowser
        entries={entries}
        columns={["Dish", "Category", "Recipe Status", "Ingredients", "Recipe Yield", "Cost / Serving", "Actions"]}
        richList
        gridColumnsClassName={CATALOG_GRID_CLASSNAME}
        searchPlaceholder="Search dishes, categories…"
        emptyLabel="No active food items yet. Add dishes in the Menu Catalog first."
        filterOptions={filterOptions}
        filters={
          <Select key="status-filter" items={statusItems} value={statusFilter} onValueChange={(value) => setStatusFilter((value as StatusFilter) ?? "ALL")}>
            <SelectTrigger aria-label="Filter by recipe status" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PILLS.map((p) => (
                <SelectItem key={p.key} value={p.key}>
                  {statusItems[p.key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
        sortOptions={sortOptions}
        defaultView="list"
      />
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

      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Recipe</DialogTitle>
            <DialogDescription>Choose the dish this recipe is for.</DialogDescription>
          </DialogHeader>
          <SearchableSelect
            aria-label="Dish"
            placeholder="Search a dish without a recipe"
            searchPlaceholder="Search dishes…"
            emptyLabel="Every dish already has a recipe."
            options={rows.filter((r) => !r.hasRecipe).map((r) => ({ value: r.id, label: r.name, hint: r.category ?? undefined }))}
            value=""
            onValueChange={(id) => {
              setPicking(false);
              setEditing(rows.find((r) => r.id === id) ?? null);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
