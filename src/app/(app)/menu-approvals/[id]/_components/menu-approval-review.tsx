"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Send, Undo2, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { StorefrontMenuSection } from "@/modules/menus/menu";
import type { MenuSelectionItemInput } from "@/modules/menu-approvals/menu-approval";
import type { MenuSelectionStatus } from "@/generated/prisma/enums";
import {
  updateMenuApprovalItemsAction,
  setCustomMenuPriceAction,
  kitchenApprovesAction,
  kitchenRequestsChangesAction,
  sendMenuForApprovalAction,
  recallMenuAction,
} from "../../actions";

interface VersionSummary {
  versionNumber: number;
  createdAt: Date;
  sentAt: Date | null;
  /** Set once a newer version was sent (or the menu was recalled) — the version can no longer be approved. */
  superseded: boolean;
  items: { name: string }[];
}

interface MenuApprovalReviewProps {
  menuSelectionId: string;
  status: MenuSelectionStatus;
  customerRequestNote: string | null;
  kitchenRequestNote: string | null;
  lockedAt: Date | null;
  groups: { key: string; name: string; sections: StorefrontMenuSection[] }[];
  isCustomMenu: boolean;
  chosenMenuName: string | null;
  guests: number;
  customPricePerPlate: number | null;
  initialItems: { itemType: string; catalogId: string; name: string; isExtra: boolean }[];
  versions: VersionSummary[];
  currentVersion: number;
  /** The live customer approval link while the menu is awaiting the customer, else null. */
  approvalUrl: string | null;
  statusLabel: string;
}

// The team edits a menu only while no version of it is with the customer or
// the kitchen (mirrors EDITABLE_STATUSES in menu-approval.ts, which enforces
// it server-side). To change a sent menu, recall it first.
const EDITABLE_STATUSES: MenuSelectionStatus[] = ["DRAFT", "CHANGES_REQUESTED", "KITCHEN_CHANGES_REQUESTED"];
const WITH_CUSTOMER: MenuSelectionStatus[] = ["SENT_TO_CUSTOMER", "CUSTOMER_REVIEWING"];

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
  groups,
  isCustomMenu,
  chosenMenuName,
  guests,
  customPricePerPlate,
  initialItems,
  versions,
  currentVersion,
  approvalUrl,
  statusLabel,
}: MenuApprovalReviewProps) {
  const router = useRouter();
  // Menu Selection is add/remove only — a picked dish is in or out, never a quantity.
  const [pickedIds, setPickedIds] = useState<Set<string>>(new Set(initialItems.filter((i) => i.itemType === "MENU_ITEM").map((i) => i.catalogId)));
  const extraIds = new Set(initialItems.filter((i) => i.isExtra).map((i) => i.catalogId));
  const addOns = initialItems.filter((i) => i.itemType === "ADD_ON");
  const [pricePerPlate, setPricePerPlate] = useState(customPricePerPlate === null ? "" : String(customPricePerPlate));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"save" | "approve" | "changes" | "send" | "recall" | "price" | null>(null);
  const [sentUrl, setSentUrl] = useState<string | null>(null);

  const editable = EDITABLE_STATUSES.includes(status);
  const withCustomer = WITH_CUSTOMER.includes(status);
  const liveUrl = sentUrl ?? approvalUrl;

  function toggle(itemId: string) {
    setPickedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function currentItems(): MenuSelectionItemInput[] {
    return [
      ...[...pickedIds].map((catalogId) => ({ itemType: "MENU_ITEM" as const, catalogId, isExtra: extraIds.has(catalogId) })),
      // Add-ons aren't edited here — resend them so a save doesn't drop them.
      ...addOns.map((a) => ({ itemType: "ADD_ON" as const, catalogId: a.catalogId })),
    ];
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

  async function handleSavePrice() {
    setError(null);
    const value = Number(pricePerPlate);
    if (pricePerPlate.trim() === "" || !Number.isFinite(value) || value < 0) {
      setError("Enter a price per plate of zero or more.");
      return;
    }
    setPending("price");
    const result = await setCustomMenuPriceAction(menuSelectionId, value);
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleApprove() {
    setError(null);
    setPending("approve");
    // No save first: during kitchen review the menu is read-only (the customer approved exactly this version).
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
    const result = await kitchenRequestsChangesAction(menuSelectionId, note);
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNote("");
    router.refresh();
  }

  async function handleSend() {
    setError(null);
    setPending("send");
    if (!(await saveItems())) {
      setPending(null);
      return;
    }
    const result = await sendMenuForApprovalAction({ menuSelectionId });
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSentUrl(result.url);
    router.refresh();
  }

  async function handleRecall() {
    setError(null);
    setPending("recall");
    const result = await recallMenuAction(menuSelectionId);
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSentUrl(null);
    router.refresh();
  }

  const quotedAmount = pricePerPlate.trim() !== "" && Number.isFinite(Number(pricePerPlate)) ? Number(pricePerPlate) * guests : null;

  return (
    <div className="flex flex-col gap-6">
      {withCustomer && (
        <div className="flex flex-col gap-2 rounded-md border border-info/30 bg-info/10 p-3 text-sm">
          <span className="font-medium text-info">
            Version {currentVersion} is with the customer — {statusLabel}
          </span>
          <span className="text-muted-foreground">
            Only this version can be approved. To change the menu, recall it, edit it, and send an updated version — the old link stops working.
          </span>
          {liveUrl && (
            <div className="flex flex-wrap items-center gap-2">
              <code className="max-w-full truncate rounded bg-background px-2 py-1 text-xs">{liveUrl}</code>
              <CopyButton value={liveUrl} label="Copy link" size="md" />
            </div>
          )}
        </div>
      )}
      {editable && (
        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          {status === "DRAFT" && "Check the menu, items, quantities and guest count, then send it to the customer for approval."}
          {status === "CHANGES_REQUESTED" && "The customer asked for changes. Update the menu, then send an updated version."}
          {status === "KITCHEN_CHANGES_REQUESTED" && "The kitchen asked for changes. Update the menu, then send an updated version to the customer."}
        </div>
      )}
      {status === "KITCHEN_REVIEWING" && (
        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          The customer approved version {currentVersion}. Approve it to send the order straight to the kitchen, or request changes.
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
          Approved and sent to the kitchen on {formatDateTime(lockedAt)} — no further changes.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {isCustomMenu ? <Badge variant="warning">Custom Menu</Badge> : chosenMenuName ? <Badge variant="info">{chosenMenuName}</Badge> : null}
        <span className="text-muted-foreground">{guests} guests</span>
      </div>

      {isCustomMenu && (
        <Card>
          <CardHeader>
            <CardTitle>Quote the price per plate</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">The customer picked their own dishes and saw no price. Enter your per-plate quote — it becomes this order&apos;s menu amount.</p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ma-price">Price per plate (₹)</Label>
                <Input id="ma-price" type="number" min={0} className="w-40" value={pricePerPlate} onChange={(e) => setPricePerPlate(e.target.value)} />
              </div>
              <Button type="button" size="md" disabled={pending !== null} onClick={handleSavePrice}>
                {pending === "price" ? "Saving…" : "Save price"}
              </Button>
              {quotedAmount !== null && <span className="pb-2 text-sm text-muted-foreground">= {formatCurrency(quotedAmount)} for {guests} guests</span>}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-8">
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">The menu this customer chose is no longer available.</p>
        ) : (
          groups.map((group) => (
            <section key={group.key} className="flex flex-col gap-3">
              {groups.length > 1 && <h2 className="text-lg font-semibold">{group.name}</h2>}
              {group.sections.map((section) => (
                <div key={section.categoryId ?? "other"} className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{section.categoryName}</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {section.items.map((item) => {
                      const picked = pickedIds.has(item.id);
                      return (
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
                            <div className="flex flex-1 flex-col gap-1">
                              <span className="text-sm font-medium">{item.name}</span>
                              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                                {formatCurrency(item.price)}
                                {picked && extraIds.has(item.id) && <Badge variant="warning">Extra</Badge>}
                              </span>
                            </div>
                            <Button type="button" size="md" variant={picked ? "outline" : "default"} disabled={!editable} onClick={() => toggle(item.id)} aria-pressed={picked} aria-label={`${picked ? "Remove" : "Add"} ${item.name}`}>
                              {picked ? <Check /> : <Plus />}
                              {picked ? "Selected" : "Add"}
                            </Button>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              ))}
            </section>
          ))
        )}
      </div>

      {addOns.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Add-ons chosen by the customer</h2>
          <div className="flex flex-wrap gap-2">
            {addOns.map((a) => (
              <Badge key={a.catalogId} variant="neutral">
                {a.name}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {status === "KITCHEN_REVIEWING" && (
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
          <>
            <Button type="button" variant="outline" disabled={pending !== null} onClick={handleSave}>
              {pending === "save" ? "Saving…" : "Save Changes"}
            </Button>
            <Button type="button" disabled={pending !== null} onClick={handleSend}>
              <Send data-icon="inline-start" />
              {pending === "send" ? "Sending…" : versions.length > 0 ? "Send Updated Menu for Approval" : "Send Menu for Approval"}
            </Button>
          </>
        )}
        {withCustomer && (
          <Button type="button" variant="outline" disabled={pending !== null} onClick={handleRecall}>
            <Undo2 data-icon="inline-start" />
            {pending === "recall" ? "Recalling…" : "Recall to Edit"}
          </Button>
        )}
        {status === "KITCHEN_REVIEWING" && (
          <>
            <Button type="button" variant="outline" disabled={pending !== null} onClick={handleRequestChanges}>
              {pending === "changes" ? "Saving…" : "Request Changes"}
            </Button>
            <Button type="button" disabled={pending !== null} onClick={handleApprove}>
              {pending === "approve" ? "Approving…" : "Approve & Send to Kitchen"}
            </Button>
          </>
        )}
      </div>

      {versions.length > 0 && (
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Version History</h2>
          {versions.map((version) => (
            <div key={version.versionNumber} className="rounded-md border border-border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-medium">
                  Version {version.versionNumber}
                  <Badge variant={version.superseded ? "neutral" : "info"}>{version.superseded ? "Superseded" : statusLabel}</Badge>
                </span>
                <span className="text-xs text-muted-foreground">{formatDateTime(version.sentAt ?? version.createdAt)}</span>
              </div>
              <ul className="mt-1 flex flex-col gap-0.5 text-muted-foreground">
                {version.items.map((item, index) => (
                  <li key={index}>{item.name}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
