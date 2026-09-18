"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { StorefrontMenu } from "@/modules/menus/menu";
import type { MenuSelectionStatus } from "@/generated/prisma/enums";
import {
  updateMenuApprovalItemsAction,
  kitchenApprovesAction,
  kitchenRequestsChangesAction,
  resumeKitchenReviewAction,
  lockMenuSelectionAction,
} from "../../actions";

interface SelectedItem {
  itemType: "MENU_ITEM";
  catalogId: string;
  quantity: number;
}

interface VersionSummary {
  versionNumber: number;
  status: MenuSelectionStatus;
  createdAt: Date;
  items: { name: string; quantity: number; unitPrice: number }[];
}

interface MenuApprovalReviewProps {
  menuSelectionId: string;
  status: MenuSelectionStatus;
  customerRequestNote: string | null;
  kitchenRequestNote: string | null;
  lockedAt: Date | null;
  menus: StorefrontMenu[];
  initialItems: { itemType: string; catalogId: string; quantity: number }[];
  versions: VersionSummary[];
}

// Items are only editable while the kitchen is actively working the
// selection. Once KITCHEN_APPROVED, the state machine has no path back to
// KITCHEN_REVIEWING (see VALID_TRANSITIONS in menu-approval.ts) — the only
// remaining move is Lock.
const EDITABLE_STATUSES: MenuSelectionStatus[] = ["KITCHEN_REVIEWING", "KITCHEN_CHANGES_REQUESTED"];

function formatCurrency(amount: number) {
  return `₹${amount.toFixed(2)}`;
}

function formatDateTime(date: Date) {
  return date.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function MenuApprovalReview({
  menuSelectionId,
  status,
  customerRequestNote,
  kitchenRequestNote,
  lockedAt,
  menus,
  initialItems,
  versions,
}: MenuApprovalReviewProps) {
  const router = useRouter();
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(initialItems.filter((item) => item.itemType === "MENU_ITEM").map((item) => [item.catalogId, item.quantity])),
  );
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"save" | "approve" | "changes" | "resume" | "lock" | null>(null);

  const editable = EDITABLE_STATUSES.includes(status);

  function setQuantity(itemId: string, quantity: number) {
    setQuantities((prev) => ({ ...prev, [itemId]: Math.max(0, quantity) }));
  }

  function currentItems(): SelectedItem[] {
    return Object.entries(quantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([catalogId, quantity]) => ({ itemType: "MENU_ITEM" as const, catalogId, quantity }));
  }

  async function saveItems() {
    const result = await updateMenuApprovalItemsAction(menuSelectionId, currentItems());
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    return true;
  }

  async function handleSave() {
    setError(null);
    setPending("save");
    const ok = await saveItems();
    setPending(null);
    if (ok) router.refresh();
  }

  async function handleApprove() {
    setError(null);
    setPending("approve");
    if (!(await saveItems())) {
      setPending(null);
      return;
    }
    const result = await kitchenApprovesAction(menuSelectionId);
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleRequestChanges() {
    setError(null);
    setPending("changes");
    await saveItems();
    const result = await kitchenRequestsChangesAction(menuSelectionId, note);
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNote("");
    router.refresh();
  }

  async function handleResume() {
    setError(null);
    setPending("resume");
    if (!(await saveItems())) {
      setPending(null);
      return;
    }
    const result = await resumeKitchenReviewAction(menuSelectionId);
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleLock() {
    setError(null);
    setPending("lock");
    const result = await lockMenuSelectionAction(menuSelectionId);
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {!editable && status !== "KITCHEN_APPROVED" && status !== "FINAL_LOCKED" && (
        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          Still with the customer — nothing for the kitchen to do yet.
        </div>
      )}

      {customerRequestNote && (
        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
          <span className="font-medium">Customer&apos;s note: </span>
          {customerRequestNote}
        </div>
      )}
      {kitchenRequestNote && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <span className="font-medium">Kitchen&apos;s note: </span>
          {kitchenRequestNote}
        </div>
      )}
      {status === "FINAL_LOCKED" && lockedAt && (
        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          Locked on {formatDateTime(lockedAt)} — no further changes.
        </div>
      )}

      <div className="flex flex-col gap-8">
        {menus.length === 0 ? (
          <p className="text-sm text-muted-foreground">No menus are available for this event type / preference anymore.</p>
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
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {section.items.map((item) => (
                      <Card key={item.id} className="overflow-hidden py-0">
                        <CardContent className="flex items-center gap-4 p-4">
                          {item.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.image} alt="" className="size-16 shrink-0 rounded-md object-cover" />
                          ) : (
                            <div className="flex size-16 shrink-0 items-center justify-center rounded-md bg-muted">
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
                            disabled={!editable}
                            className="h-10 w-16 shrink-0"
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
      </div>

      {editable && (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <Label htmlFor="ma-note">Note to attach if requesting changes (optional)</Label>
          <Textarea
            id="ma-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. this item is out of season, confirm a substitute with the customer"
          />
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {editable && (
          <Button type="button" variant="outline" disabled={pending !== null} onClick={handleSave}>
            {pending === "save" ? "Saving…" : "Save Changes"}
          </Button>
        )}
        {status === "KITCHEN_REVIEWING" && (
          <>
            <Button type="button" variant="outline" disabled={pending !== null} onClick={handleRequestChanges}>
              {pending === "changes" ? "Saving…" : "Request Changes"}
            </Button>
            <Button type="button" disabled={pending !== null} onClick={handleApprove}>
              {pending === "approve" ? "Approving…" : "Approve"}
            </Button>
          </>
        )}
        {status === "KITCHEN_CHANGES_REQUESTED" && (
          <Button type="button" disabled={pending !== null} onClick={handleResume}>
            {pending === "resume" ? "Resuming…" : "Resume Review"}
          </Button>
        )}
        {status === "KITCHEN_APPROVED" && (
          <Button type="button" disabled={pending !== null} onClick={handleLock}>
            {pending === "lock" ? "Locking…" : "Lock Menu"}
          </Button>
        )}
      </div>

      {versions.length > 0 && (
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Version History</h2>
          {versions.map((version) => (
            <div key={version.versionNumber} className="rounded-md border border-border p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">Version {version.versionNumber}</span>
                <span className="text-xs text-muted-foreground">{formatDateTime(version.createdAt)}</span>
              </div>
              <ul className="mt-1 flex flex-col gap-0.5 text-muted-foreground">
                {version.items.map((item, index) => (
                  <li key={index}>
                    {item.name} × {item.quantity} — {formatCurrency(item.unitPrice * item.quantity)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
