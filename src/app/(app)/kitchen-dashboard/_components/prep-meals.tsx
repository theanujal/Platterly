"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, ImageOff, Users, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cookQuantity } from "@/modules/menu-approvals/kitchen-production-status";
import { cn } from "cn";

export interface PrepMeal {
  key: string;
  label: string;
  dateLabel: string;
  menuName: string | null;
  categories: { name: string; items: { name: string; image: string | null; guestQuantity: number; cookQuantity: number }[] }[];
}

// Section header tints, cycled per category (AJ's design: orange, green, blue…).
const CATEGORY_TINTS = ["bg-tone-orange/10", "bg-success/10", "bg-info/10", "bg-tone-violet/10", "bg-tone-teal/10"];

const itemCount = (meal: PrepMeal) => meal.categories.reduce((n, c) => n + c.items.length, 0);
const itemsLabel = (n: number) => `${n} ${n === 1 ? "item" : "items"}`;

/**
 * The selected meal's dishes, grouped by category with guest and cook quantities.
 * Meal tabs only for a Multi Order (AJ, 2026-09-30); the previous/next arrows
 * only once it has 3 or more meals to page through.
 */
export function PrepMeals({ meals, guests, extraPercent, isMultiOrder }: { meals: PrepMeal[]; guests: number; extraPercent: number; isMultiOrder: boolean }) {
  const [selectedKey, setSelectedKey] = useState(meals[0]?.key);
  const selected = meals.find((m) => m.key === selectedKey) ?? meals[0];
  const selectedIndex = meals.indexOf(selected);
  if (!selected) return null;

  const step = (delta: number) => setSelectedKey(meals[Math.min(meals.length - 1, Math.max(0, selectedIndex + delta))].key);
  const cookGuests = cookQuantity(guests, extraPercent);
  const showArrows = meals.length >= 3;

  return (
    <div className="flex flex-col gap-4">
      {isMultiOrder && (
      <div className="flex items-center gap-2">
        {showArrows && (
          <Button variant="outline" size="icon" aria-label="Previous meal" disabled={selectedIndex === 0} onClick={() => step(-1)}>
            <ChevronLeft />
          </Button>
        )}
        <div role="tablist" aria-label="Meals" className="flex flex-1 gap-3 overflow-x-auto p-0.5">
          {meals.map((meal) => (
            <button
              key={meal.key}
              type="button"
              role="tab"
              aria-selected={meal.key === selected.key}
              onClick={() => setSelectedKey(meal.key)}
              className={cn(
                "flex min-w-40 flex-1 flex-col gap-0.5 rounded-xl border bg-card p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                meal.key === selected.key ? "border-primary bg-accent/40" : "border-border hover:bg-muted",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-semibold">{meal.label}</span>
                <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">{itemsLabel(itemCount(meal))}</span>
              </span>
              <span className="text-xs text-muted-foreground">{meal.dateLabel}</span>
            </button>
          ))}
        </div>
        {showArrows && (
          <Button variant="outline" size="icon" aria-label="Next meal" disabled={selectedIndex === meals.length - 1} onClick={() => step(1)}>
            <ChevronRight />
          </Button>
        )}
      </div>
      )}

      <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4" aria-label={`${selected.label} preparation`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <UtensilsCrossed className="size-6" />
            </span>
            <div>
              <h2 className="text-lg font-semibold">{selected.label}</h2>
              <p className="text-sm text-muted-foreground">
                {itemsLabel(itemCount(selected))} to prepare{selected.menuName ? ` · ${selected.menuName}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-secondary px-4 py-2 text-sm">
            <Users className="size-5 text-muted-foreground" />
            <div>
              <p className="font-medium">{guests} guests</p>
              <p className="text-xs text-muted-foreground">
                Cook for {cookGuests} portions ({extraPercent}% extra)
              </p>
            </div>
          </div>
        </div>

        {selected.categories.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No dishes picked for this meal.</p>}
        {selected.categories.map((category, index) => (
          <div key={category.name} className="overflow-hidden rounded-lg border border-border">
            <div className={cn("grid grid-cols-[1fr_5rem_7rem] items-center gap-2 px-4 py-2.5 text-sm sm:grid-cols-[1fr_8rem_10rem]", CATEGORY_TINTS[index % CATEGORY_TINTS.length])}>
              <span className="font-semibold">
                {category.name} <span className="font-normal text-muted-foreground">({itemsLabel(category.items.length)})</span>
              </span>
              <span className="text-right text-xs text-muted-foreground">Guest Qty</span>
              <span className="text-right text-xs text-muted-foreground">Cook Qty ({extraPercent}% extra)</span>
            </div>
            <ul className="divide-y divide-border">
              {category.items.map((item, i) => (
                <li key={`${item.name}-${i}`} className="grid grid-cols-[1fr_5rem_7rem] items-center gap-2 px-4 py-2 text-sm sm:grid-cols-[1fr_8rem_10rem]">
                  <span className="flex min-w-0 items-center gap-3">
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element -- catalog uploads are plain /uploads files, same as the rest of the app
                      <img src={item.image} alt="" className="size-9 shrink-0 rounded-md object-cover" />
                    ) : (
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <ImageOff className="size-4" />
                      </span>
                    )}
                    <span className="truncate">{item.name}</span>
                  </span>
                  <span className="text-right">{item.guestQuantity}</span>
                  <span className="text-right font-medium">{item.cookQuantity}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
