"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, ChefHat, Search, UtensilsCrossed } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StepFooter } from "@/components/public/step-footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IconInput } from "@/components/ui/icon-input";
import { FormCard } from "@/components/public/form-section";
import { formatInr } from "@/lib/format-currency";
import type { StorefrontMenu } from "@/modules/menus/menu";
import type { MenuChoice } from "@/modules/menu-approvals/storefront-draft";
import { saveMenuChoiceAction } from "../actions";
import { cn } from "cn";

interface MenuStepProps {
  tenantSlug: string;
  draftId: string;
  menus: StorefrontMenu[];
  selected?: MenuChoice;
}

export function MenuStep({ tenantSlug, draftId, menus, selected }: MenuStepProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [details, setDetails] = useState<StorefrontMenu | null>(null);
  // Nothing is picked for the customer: the choice starts empty (or as the one they made before going back) and
  // only changes when they press Select. Continue saves it.
  const [choice, setChoice] = useState<MenuChoice | null>(selected ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const needle = query.trim().toLowerCase();
  // Menus arrive in the order the caterer set in Menu Types; searching only narrows them.
  const visibleMenus = needle ? menus.filter((menu) => `${menu.name} ${menu.description ?? ""}`.toLowerCase().includes(needle)) : menus;
  const customSelected = choice?.kind === "CUSTOM";

  async function handleContinue() {
    if (!choice) return;
    setError(null);
    setPending(true);
    const result = await saveMenuChoiceAction(tenantSlug, draftId, choice);
    if (!result.ok) {
      setPending(false);
      setError(result.error);
      return;
    }
    router.push(`/${tenantSlug}/plan/${draftId}?step=items`);
  }


  return (
    <div className="flex flex-col gap-6 pb-28">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold">Choose Your Menu</h2>
        <p className="text-sm text-muted-foreground">Pick a ready-made menu or create your own.</p>
      </div>

      <FormCard className="gap-5">
        {/* Search first, then the Grid / List switch, on one row, as on the backend's catalog pages. */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-48 flex-1">
            <IconInput icon={Search} type="search" aria-label="Search menus" placeholder="Search menus…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleMenus.map((menu) => {
          const isSelected = choice?.kind === "MENU" && choice.menuId === menu.id;
          const veg = menu.menuType === "VEGETARIAN";
          return (
            <Card key={menu.id} className={cn("overflow-hidden py-0", isSelected && "border-primary ring-primary")} data-testid="menu-card">
              <div className="flex h-full flex-col">
                <div className="relative shrink-0">
                  {menu.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={menu.image} alt="" className="aspect-[2/1] w-full object-cover" />
                  ) : (
                    <div className="flex aspect-[2/1] w-full items-center justify-center bg-muted">
                      <UtensilsCrossed className="size-7 text-muted-foreground" />
                    </div>
                  )}
                  <Badge className={cn("absolute top-3 right-3 bg-background/90", veg ? "text-success" : "text-destructive")}>{veg ? "Veg" : "Non-Veg"}</Badge>
                </div>
                <CardContent className="flex flex-1 flex-col gap-2 p-4">
                  <h3 className="text-base font-semibold">{menu.name}</h3>
                  {menu.description && <p className="line-clamp-2 text-sm text-muted-foreground">{menu.description}</p>}
                  <div>
                    <Button type="button" variant="link" className="h-auto p-0 font-semibold" onClick={() => setDetails(menu)}>
                      View details <ArrowRight />
                    </Button>
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                    <span className="text-base font-semibold">
                      {formatInr(menu.pricePerPlate)} <span className="text-xs font-normal text-muted-foreground">/ plate</span>
                    </span>
                    <Button type="button" size="md" variant={isSelected ? "default" : "outline"} aria-pressed={isSelected} onClick={() => setChoice({ kind: "MENU", menuId: menu.id })}>
                      {isSelected && <Check />}
                      {isSelected ? "Selected" : "Select"}
                    </Button>
                  </div>
                </CardContent>
              </div>
            </Card>
          );
        })}
      </div>

      {menus.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">No ready-made menus are set up for this event yet — you can still create a custom menu below.</p>
      )}
      {menus.length > 0 && visibleMenus.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">No menus match &ldquo;{query.trim()}&rdquo;. You can still create a custom menu.</p>
      )}

      {/* Custom Menu sits on its own full-width row under the menus, not among them. */}
      <div
        className={cn("flex flex-col gap-4 rounded-xl bg-accent/60 p-4 ring-1 sm:flex-row sm:items-center", customSelected ? "ring-primary" : "ring-foreground/10")}
        data-testid="custom-menu-card"
      >
        <span className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ChefHat className="size-7" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold">Create Custom Menu</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Hand-pick every dish yourself. There&apos;s no fixed price — our team will review your choices and confirm the price per plate.
          </p>
        </div>
        <Button type="button" variant={customSelected ? "default" : "outline"} aria-pressed={customSelected} onClick={() => setChoice({ kind: "CUSTOM" })}>
          {customSelected && <Check />}
          {customSelected ? "Selected" : "Create custom menu"}
          {!customSelected && <ArrowRight />}
        </Button>
      </div>

      </FormCard>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <StepFooter onBack={() => router.push(`/${tenantSlug}/plan/${draftId}?step=details`)}>
        <Button type="button" disabled={!choice || pending} onClick={handleContinue}>
          {pending ? "Saving…" : "Continue to Menu Items"}
          <ArrowRight />
        </Button>
      </StepFooter>

      <Dialog open={details !== null} onOpenChange={(open) => !open && setDetails(null)}>
        <DialogContent className="max-h-[90vh] gap-5 overflow-y-auto sm:max-w-3xl">
          {details && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl font-semibold">{details.name}</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-[30%_minmax(0,1fr)]">
                {details.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={details.image} alt={details.name} className="aspect-4/3 w-full rounded-lg object-cover" />
                ) : (
                  <div className="flex aspect-4/3 w-full items-center justify-center rounded-lg bg-muted">
                    <UtensilsCrossed className="size-10 text-muted-foreground" />
                  </div>
                )}
                <div className="flex min-w-0 flex-col gap-4">
                  <div className="flex items-center justify-between gap-3">
                    <Badge variant={details.menuType === "VEGETARIAN" ? "success" : "danger"}>{details.menuType === "VEGETARIAN" ? "Veg" : "Non-Veg"}</Badge>
                    <p className="text-sm font-semibold">{formatInr(details.pricePerPlate)} / plate</p>
                  </div>
                  {details.description && <p className="whitespace-pre-line text-sm text-muted-foreground">{details.description}</p>}
                  {details.sections.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <h4 className="text-sm font-semibold">Categories</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {details.sections.map((section) => (
                          <Badge key={section.categoryId ?? "other"} variant="outline">
                            {section.categoryName}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter className="sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setDetails(null)}>
                  Close
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setChoice({ kind: "MENU", menuId: details.id });
                    setDetails(null);
                  }}
                >
                  Select this menu
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
