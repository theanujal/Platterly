"use client";

import { useState } from "react";
import { UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { StorefrontMenu } from "@/modules/menus/menu";
import { saveMenuSelectionItemsAction, approveMenuSelectionAction, requestMenuSelectionChangesAction } from "../actions";

interface SelectedItem {
  itemType: "MENU_ITEM";
  catalogId: string;
  quantity: number;
}

interface MenuSelectionFormProps {
  tenantSlug: string;
  menuSelectionId: string;
  menus: StorefrontMenu[];
  initialItems: { itemType: string; catalogId: string; quantity: number }[];
}

export function MenuSelectionForm({ tenantSlug, menuSelectionId, menus, initialItems }: MenuSelectionFormProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(initialItems.filter((i) => i.itemType === "MENU_ITEM").map((i) => [i.catalogId, i.quantity])),
  );
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"approve" | "changes" | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function setQuantity(itemId: string, quantity: number) {
    setQuantities((prev) => ({ ...prev, [itemId]: Math.max(0, quantity) }));
  }

  function currentItems(): SelectedItem[] {
    return Object.entries(quantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([catalogId, quantity]) => ({ itemType: "MENU_ITEM" as const, catalogId, quantity }));
  }

  async function handleApprove() {
    setError(null);
    const items = currentItems();
    if (items.length === 0) {
      setError("Select at least one item before submitting.");
      return;
    }
    setPending("approve");
    const saveResult = await saveMenuSelectionItemsAction(tenantSlug, menuSelectionId, items);
    if (!saveResult.ok) {
      setPending(null);
      setError(saveResult.error);
      return;
    }
    const approveResult = await approveMenuSelectionAction(tenantSlug, menuSelectionId);
    setPending(null);
    if (!approveResult.ok) {
      setError(approveResult.error);
      return;
    }
    setSubmitted(true);
  }

  async function handleRequestChanges() {
    setError(null);
    setPending("changes");
    const items = currentItems();
    if (items.length > 0) {
      await saveMenuSelectionItemsAction(tenantSlug, menuSelectionId, items);
    }
    const result = await requestMenuSelectionChangesAction(tenantSlug, menuSelectionId, note);
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNote("");
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <h2 className="text-lg font-semibold">Thanks — your menu selection is submitted</h2>
        <p className="text-sm text-muted-foreground">Our team will follow up with you shortly over WhatsApp or email.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {menus.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">No menus are available for this event type yet — please check back soon.</p>
      ) : (
        menus.map((menu) => (
          <section key={menu.id} className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{menu.name}</h2>
              <Badge variant={menu.menuType === "VEGETARIAN" ? "default" : "outline"}>{menu.menuType === "VEGETARIAN" ? "Veg" : "Non-Veg"}</Badge>
            </div>
            {menu.sections.map((section) => (
              <div key={section.categoryId ?? "other"} className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{section.categoryName}</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {section.items.map((item) => (
                    <Card key={item.id} className="overflow-hidden py-0">
                      <CardContent className="flex items-center gap-3 p-3">
                        {item.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.image} alt="" className="size-14 shrink-0 rounded-md object-cover" />
                        ) : (
                          <div className="flex size-14 shrink-0 items-center justify-center rounded-md bg-muted">
                            <UtensilsCrossed className="size-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex flex-1 flex-col gap-0.5">
                          <span className="text-sm font-medium">{item.name}</span>
                          <span className="text-xs text-muted-foreground">₹{item.price.toFixed(2)}</span>
                        </div>
                        <Input
                          type="number"
                          min={0}
                          className="w-16 shrink-0"
                          value={quantities[item.id] ?? 0}
                          onChange={(e) => setQuantity(item.id, Number(e.target.value))}
                          aria-label={`Quantity for ${item.name}`}
                        />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))
      )}

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <Label htmlFor="ms-note">Anything you&apos;d like to note before we confirm? (Optional)</Label>
        <Textarea id="ms-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. please call me to discuss a custom item" />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" disabled={pending !== null} onClick={handleRequestChanges}>
          {pending === "changes" ? "Saving…" : "Save & Request a Call"}
        </Button>
        <Button type="button" disabled={pending !== null} onClick={handleApprove}>
          {pending === "approve" ? "Submitting…" : "Approve & Submit"}
        </Button>
      </div>
    </div>
  );
}
