"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Boxes, CircleAlert, PackageCheck, Undo2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { returnOrderItemAction, sendOrderItemsAction } from "../../../kitchen-dashboard/production/actions";
import { cn } from "cn";

export interface OrderInventoryLineData {
  inventoryId: string;
  name: string;
  unit: string;
  fromRecipes: number;
  extra: number;
  required: number;
  sent: number;
  remaining: number;
  surplus: number;
  inStock: number;
  short: number;
  forDishes: string[];
}

export interface OrderInventoryData {
  guests: number;
  servings: number;
  extraPercent: number;
  lines: OrderInventoryLineData[];
  withoutRecipe: string[];
  approved: boolean;
  closed: boolean;
  canSend: boolean;
  canReturn: boolean;
  blockedReason: string | null;
}

const num = (n: number) => String(Math.round(n * 1000) / 1000);

/**
 * The order's Inventory tab (AJ, 2026-10-10), laid out like the reference: on the left what the order requires, with every
 * item that is short or has no recipe highlighted, and the button that sends the items; on the right what has been sent,
 * the stock now available, and an undo arrow that returns an item to the shelf. Extra items (no recipe) are added below
 * the list. Sending can only happen once the customer has approved the menu, and re-sending sends only the difference.
 */
export function OrderInventoryPanel({ orderId, data, canEdit, extrasSlot }: { orderId: string; data: OrderInventoryData; canEdit: boolean; extrasSlot: React.ReactNode }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const required = data.lines.filter((l) => l.required > 0);
  const toSend = data.lines.filter((l) => l.remaining > 0);
  const shortLines = toSend.filter((l) => l.short > 0);
  const sentLines = data.lines.filter((l) => l.sent > 0);
  const surplusLines = data.lines.filter((l) => l.surplus > 0);

  async function send() {
    setPending(true);
    const result = await sendOrderItemsAction(orderId);
    setPending(false);
    setConfirmOpen(false);
    if (!result.ok) return setNotice({ ok: false, text: result.error });
    setNotice({
      ok: true,
      text: result.shortages.length > 0 ? `Items sent. Short on: ${result.shortages.map((s) => `${s.name} (${s.short})`).join(", ")}. Order more with Purchasing.` : "Items sent and the inventory is updated.",
    });
    router.refresh();
  }

  async function giveBack(line: OrderInventoryLineData) {
    setBusyId(line.inventoryId);
    const result = await returnOrderItemAction(orderId, line.inventoryId);
    setBusyId(null);
    setNotice(result.ok ? { ok: true, text: result.message } : { ok: false, text: result.error });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4" data-testid="order-inventory">
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        <Card className="h-full" data-testid="inventory-required-card">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Boxes className="size-4" />
                </span>
                <CardTitle className="text-lg">Required for this order</CardTitle>
              </div>
              <span className="text-sm text-muted-foreground">{required.length} item{required.length === 1 ? "" : "s"}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {data.guests > 0
                ? `${data.guests} guests plus ${data.extraPercent}% extra, so every dish is cooked for ${data.servings}. Quantities come from each dish's recipe, plus any extra items you add.`
                : "Add the guest count to the order to see what its dishes need."}
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!data.approved && !data.closed && (
              <p className="flex items-start gap-2 rounded-lg bg-info/10 p-3 text-sm text-info" data-testid="inventory-not-approved">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                {data.blockedReason}
              </p>
            )}
            {data.withoutRecipe.length > 0 && (
              <p className="flex items-start gap-2 rounded-lg bg-warning/10 p-3 text-sm text-warning" data-testid="inventory-without-recipe">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                <span>
                  No recipe for {data.withoutRecipe.join(", ")}, so their ingredients are not counted.{" "}
                  <Link href="/recipes" className="font-medium underline underline-offset-2">Add recipes</Link>
                </span>
              </p>
            )}
            {shortLines.length > 0 && (
              <p className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive" data-testid="inventory-short-alert">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                <span>
                  Not enough in stock: {shortLines.map((l) => `${l.name} (short by ${num(l.short)} ${l.unit})`).join(", ")}.{" "}
                  <Link href="/purchasing/new?from=low-stock" className="font-medium underline underline-offset-2">Order more</Link>
                </span>
              </p>
            )}

            {required.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">Nothing is required yet. Add recipes to the dishes, or add extra items below.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                {required.map((line) => {
                  const isShort = line.short > 0;
                  return (
                    <li key={line.inventoryId} data-testid="required-line" data-short={isShort} className={cn("flex items-center gap-3 px-3 py-2.5", isShort && "bg-destructive/5")}>
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Boxes className="size-5" />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium">{line.name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {line.unit}
                          {line.extra > 0 && " · extra item"}
                          {line.forDishes.length > 0 && ` · for ${line.forDishes.join(", ")}`}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1 text-right">
                        <span className="text-sm font-semibold">{num(line.required)} {line.unit}</span>
                        <span className="text-xs text-muted-foreground">{num(line.inStock)} {line.unit} in stock</span>
                        {isShort ? (
                          <Badge variant="danger" className="px-2 py-0.5 text-[11px]">Short {num(line.short)}</Badge>
                        ) : line.remaining === 0 ? (
                          <Badge variant="success" className="px-2 py-0.5 text-[11px]">Sent</Badge>
                        ) : (
                          <Badge variant="neutral" className="px-2 py-0.5 text-[11px]">To send</Badge>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}

            {canEdit && (
              <div className="flex flex-col gap-2">
                <Button type="button" size="lg" disabled={!data.canSend || pending} onClick={() => setConfirmOpen(true)} aria-describedby={data.blockedReason ? "send-items-why" : undefined}>
                  <PackageCheck />
                  Send items to this order
                </Button>
                {data.blockedReason && data.approved && (
                  <p id="send-items-why" className="text-center text-xs text-muted-foreground">
                    {data.blockedReason}
                  </p>
                )}
                {!data.approved && !data.closed && (
                  <p id="send-items-why" className="text-center text-xs text-muted-foreground">
                    Available once the customer approves the menu.
                  </p>
                )}
              </div>
            )}
            {surplusLines.length > 0 && (
              <p className="rounded-lg bg-info/10 p-3 text-sm text-info" data-testid="inventory-surplus">
                The menu changed: {surplusLines.map((l) => `${l.name} (${num(l.surplus)} ${l.unit} more than needed)`).join(", ")}. Return the extra with the undo arrow on the right.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="h-full" data-testid="inventory-sent-card">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-lg">Sent to this order</CardTitle>
              <span className="text-sm text-muted-foreground">{sentLines.length} added</span>
            </div>
            <p className="text-sm text-muted-foreground">Items taken from the shelf for this order, and what is available now.</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {notice && (
              <p role={notice.ok ? "status" : "alert"} className={cn("rounded-lg border px-3 py-2 text-sm", notice.ok ? "border-success/25 bg-success/10 text-success" : "border-destructive/30 bg-destructive/10 text-destructive")}>
                {notice.text}
              </p>
            )}
            {sentLines.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">Nothing has been sent to this order yet.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {sentLines.map((line) => (
                  <li key={line.inventoryId} data-testid="sent-line" className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Boxes className="size-5" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">{line.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {num(line.sent)} {line.unit} sent
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-center rounded-lg bg-muted px-3 py-1.5">
                      <span className={cn("text-lg font-semibold", line.inStock > 0 ? "text-success" : "text-destructive")}>{num(line.inStock)}</span>
                      <span className="text-[11px] text-muted-foreground">available</span>
                    </span>
                    {canEdit && data.canReturn && (
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Return ${line.name} to stock`} title="Return to stock" disabled={busyId === line.inventoryId} onClick={() => giveBack(line)}>
                        <Undo2 className="size-4 text-info" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {extrasSlot}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send these items to this order?</AlertDialogTitle>
            <AlertDialogDescription>
              The stock is taken now and the inventory is updated.
              {shortLines.length > 0 ? ` ${shortLines.map((l) => l.name).join(", ")} ${shortLines.length === 1 ? "is" : "are"} short: what is on the shelf is taken and the rest is noted as short.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto text-sm">
            {toSend.map((l) => (
              <li key={l.inventoryId} className="flex justify-between gap-3">
                <span>{l.name}</span>
                <span className="font-medium">{num(Math.min(l.remaining, l.inStock))} {l.unit}</span>
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={send}>
              {pending ? "Sending…" : "Send items"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
