"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, LayoutGrid, List, Sparkles, UtensilsCrossed } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  const [view, setView] = useState<"grid" | "list">("grid");
  const [details, setDetails] = useState<StorefrontMenu | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  async function choose(choice: MenuChoice) {
    setError(null);
    setPendingKey(choice.kind === "MENU" ? choice.menuId : "custom");
    const result = await saveMenuChoiceAction(tenantSlug, draftId, choice);
    if (!result.ok) {
      setPendingKey(null);
      setError(result.error);
      return;
    }
    router.push(`/${tenantSlug}/plan/${draftId}?step=items`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">Choose Your Menu</h2>
          <p className="text-sm text-muted-foreground">Pick a ready-made menu, or build your own.</p>
        </div>
        <div className="flex gap-1.5">
          <Button type="button" size="md" variant={view === "grid" ? "default" : "outline"} onClick={() => setView("grid")}>
            <LayoutGrid /> Grid
          </Button>
          <Button type="button" size="md" variant={view === "list" ? "default" : "outline"} onClick={() => setView("list")}>
            <List /> List
          </Button>
        </div>
      </div>

      <div className={cn("grid gap-4", view === "grid" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1")}>
        {menus.map((menu) => {
          const isSelected = selected?.kind === "MENU" && selected.menuId === menu.id;
          return (
            <Card key={menu.id} className={cn("overflow-hidden py-0", isSelected && "border-primary ring-primary")} data-testid="menu-card">
              <div className={cn(view === "list" ? "flex flex-col sm:flex-row" : "flex flex-col")}>
                {menu.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={menu.image} alt="" className={cn("object-cover", view === "list" ? "aspect-video w-full sm:w-48" : "aspect-video w-full")} />
                ) : (
                  <div className={cn("flex items-center justify-center bg-muted", view === "list" ? "aspect-video w-full sm:w-48" : "aspect-video w-full")}>
                    <UtensilsCrossed className="size-7 text-muted-foreground" />
                  </div>
                )}
                <CardContent className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold">{menu.name}</h3>
                    <Badge variant={menu.menuType === "VEGETARIAN" ? "success" : "danger"}>{menu.menuType === "VEGETARIAN" ? "Veg" : "Non-Veg"}</Badge>
                  </div>
                  {menu.description && <p className="line-clamp-2 text-xs text-muted-foreground">{menu.description}</p>}
                  <div>
                    <Button type="button" variant="link" className="h-auto p-0 font-semibold" onClick={() => setDetails(menu)}>
                      View details
                    </Button>
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                    <span className="text-sm font-semibold">
                      {formatInr(menu.pricePerPlate)} <span className="text-xs font-normal text-muted-foreground">/ plate</span>
                    </span>
                    <Button type="button" size="md" disabled={pendingKey !== null} onClick={() => choose({ kind: "MENU", menuId: menu.id })}>
                      {isSelected && <Check />}
                      {pendingKey === menu.id ? "Saving…" : isSelected ? "Selected" : "Select this menu"}
                    </Button>
                  </div>
                </CardContent>
              </div>
            </Card>
          );
        })}

        <Card className={cn("border-2 border-dashed border-border py-0 ring-0", selected?.kind === "CUSTOM" && "border-primary")} data-testid="custom-menu-card">
          <CardContent className="flex h-full flex-col justify-center gap-2 p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <h3 className="text-sm font-semibold">Custom Menu</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Hand-pick every dish yourself. There&apos;s no fixed price — our team will review your choices and confirm the price per plate.
            </p>
            <div className="mt-1">
              <Button type="button" size="md" variant="outline" disabled={pendingKey !== null} onClick={() => choose({ kind: "CUSTOM" })}>
                {selected?.kind === "CUSTOM" && <Check />}
                {pendingKey === "custom" ? "Saving…" : selected?.kind === "CUSTOM" ? "Selected" : "Create custom menu"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {menus.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">No ready-made menus are set up for this event yet — you can still create a custom menu above.</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div>
        <Button type="button" variant="outline" onClick={() => router.push(`/${tenantSlug}/plan/${draftId}?step=details`)}>
          <ArrowLeft /> Back
        </Button>
      </div>

      <Dialog open={details !== null} onOpenChange={(open) => !open && setDetails(null)}>
        <DialogContent className="max-h-[90vh] gap-4 overflow-y-auto sm:max-w-lg">
          {details && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl font-semibold">{details.name}</DialogTitle>
              </DialogHeader>
              {details.description && <p className="whitespace-pre-line text-sm text-muted-foreground">{details.description}</p>}
              <p className="text-sm font-semibold">{formatInr(details.pricePerPlate)} / plate</p>
              <div className="flex flex-col gap-3">
                {details.sections.map((section) => (
                  <div key={section.categoryId ?? "other"} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold">{section.categoryName}</h4>
                      {section.maxSelection !== null && <span className="text-xs text-muted-foreground">Choose up to {section.maxSelection}</span>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{section.items.map((i) => i.name).join(", ")}</p>
                  </div>
                ))}
              </div>
              <DialogFooter className="sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setDetails(null)}>
                  Close
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    const menu = details;
                    setDetails(null);
                    void choose({ kind: "MENU", menuId: menu.id });
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
