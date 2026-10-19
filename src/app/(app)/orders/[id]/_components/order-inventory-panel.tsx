"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Box, Boxes, CircleAlert, PackageCheck, Undo2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconInput } from "@/components/ui/icon-input";
import { Search } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { returnOrderItemAction, sendOrderItemsAction } from "../../../kitchen-dashboard/production/actions";
import { formatRupees } from "@/components/catalog/catalog-display";
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
  sentCost: number;
  sentCostUnknown: number;
}

export interface OrderInventoryData {
  guests: number;
  servings: number;
  extraPercent: number;
  lines: OrderInventoryLineData[];
  withoutRecipe: string[];
  /** Dishes whose recipe is still a Draft: not approved for production, so not counted. */
  draftRecipe: string[];
  approved: boolean;
  closed: boolean;
  canSend: boolean;
  canReturn: boolean;
  blockedReason: string | null;
}

const HEAD = "h-12 px-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase";
const num = (n: number) => String(Math.round(n * 1000) / 1000);

/**
 * The order's Inventory tab (AJ, 2026-10-10), laid out like the reference: on the left what the order requires, with every
 * item that is short or has no recipe highlighted, and the button that sends the items; on the right what has been sent,
 * the stock now available, and an undo arrow that returns an item to the shelf. Extra items (no recipe) are added below
 * the list. Sending can only happen once the customer has approved the menu, and re-sending sends only the difference.
 */
/** `showCosts`: the viewer holds the supplier-costs right. Without it the server sends zero costs and the cost tile and columns are not drawn. */
export function OrderInventoryPanel({ orderId, data, canEdit, extrasSlot, showCosts = true }: { orderId: string; data: OrderInventoryData; canEdit: boolean; extrasSlot: React.ReactNode; showCosts?: boolean }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "short" | "to-send" | "sent">("all");

  const required = data.lines.filter((l) => l.required > 0);
  const toSend = data.lines.filter((l) => l.remaining > 0);
  const shortLines = toSend.filter((l) => l.short > 0);
  const sentLines = data.lines.filter((l) => l.sent > 0);
  const surplusLines = data.lines.filter((l) => l.surplus > 0);
  const lineStatus = (l: OrderInventoryLineData) => (l.short > 0 ? "short" : l.remaining === 0 ? "sent" : "to-send");
  const needle = query.trim().toLowerCase();
  const shown = required.filter(
    (l) => (filter === "all" || lineStatus(l) === filter) && (!needle || l.name.toLowerCase().includes(needle) || l.forDishes.some((d) => d.toLowerCase().includes(needle))),
  );
  // One unit across everything sent reads as a quantity ("8.6 kg"); mixed units can only be counted.
  const sentUnits = new Set(sentLines.map((l) => l.unit));
  const sentTotalText = sentUnits.size === 1 ? `${num(sentLines.reduce((sum, l) => sum + l.sent, 0))} ${[...sentUnits][0]}` : `${sentLines.length} item${sentLines.length === 1 ? "" : "s"}`;

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
    <div className="@container flex flex-col gap-4" data-testid="order-inventory">
      {/* Side by side only when each card can be wide enough for its table (the order page has a sidebar, so the viewport width says little). */}
      <div className="grid grid-cols-1 items-start gap-4 @6xl:grid-cols-2">
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
            {data.draftRecipe.length > 0 && (
              <p className="flex items-start gap-2 rounded-lg bg-warning/10 p-3 text-sm text-warning" data-testid="inventory-draft-recipe">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                <span>
                  The recipe for {data.draftRecipe.join(", ")} is still a Draft, so its ingredients are not counted and none are sent.{" "}
                  <Link href="/recipes" className="font-medium underline underline-offset-2">Activate it in Recipes</Link>
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
              <>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="min-w-0 flex-1">
                    <IconInput icon={Search} aria-label="Search item or ingredient" placeholder="Search item or ingredient…" value={query} onChange={(e) => setQuery(e.target.value)} className="w-full" />
                  </div>
                  <Select
                    items={{ all: "All items", short: "Short", "to-send": "To send", sent: "Sent" }}
                    value={filter}
                    onValueChange={(v) => setFilter((v as typeof filter) ?? "all")}
                  >
                    <SelectTrigger aria-label="Filter items" className="w-full sm:w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All items</SelectItem>
                      <SelectItem value="short">Short</SelectItem>
                      <SelectItem value="to-send">To send</SelectItem>
                      <SelectItem value="sent">Sent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="overflow-hidden rounded-lg border border-border">
                  <Table>
                    <TableHeader className="bg-muted">
                      <TableRow>
                        <TableHead className={HEAD}>Item</TableHead>
                        <TableHead className={HEAD}>
                          Required Qty
                          <span className="block text-[11px] font-normal normal-case">(for this order)</span>
                        </TableHead>
                        <TableHead className={HEAD}>Current Stock</TableHead>
                        <TableHead className={HEAD}>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shown.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">No items match.</TableCell>
                        </TableRow>
                      )}
                      {shown.map((line) => {
                        const isShort = line.short > 0;
                        return (
                          <TableRow key={line.inventoryId} data-testid="required-line" data-short={isShort} className={cn(isShort && "bg-destructive/5")}>
                            <TableCell className="px-2.5 py-3">
                              <span className="flex items-center gap-3">
                                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                                  <Boxes className="size-5" />
                                </span>
                                <span className="flex min-w-0 flex-col">
                                  <span className="text-sm font-medium">{line.name}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {line.unit}
                                    {line.extra > 0 && " · extra item"}
                                    {line.forDishes.length > 0 && ` · for ${line.forDishes.join(", ")}`}
                                  </span>
                                </span>
                              </span>
                            </TableCell>
                            <TableCell className="px-2.5 py-3 text-sm font-semibold whitespace-nowrap">{num(line.required)} {line.unit}</TableCell>
                            <TableCell className="px-2.5 py-3 text-sm whitespace-nowrap">{num(line.inStock)} {line.unit}</TableCell>
                            <TableCell className="px-2.5 py-3">
                              {isShort ? (
                                <Badge variant="danger" className="px-2 py-0.5 text-[11px]">Short {num(line.short)}</Badge>
                              ) : line.remaining === 0 ? (
                                <Badge variant="success" className="px-2 py-0.5 text-[11px]">Sent</Badge>
                              ) : (
                                <Badge variant="neutral" className="px-2 py-0.5 text-[11px]">To send</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
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
                    Available once the kitchen moves the order to In Preparation.
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
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Boxes className="size-4" />
                </span>
                <CardTitle className="text-lg">Sent to this order</CardTitle>
              </div>
              <span className="text-sm text-muted-foreground">{sentLines.length} item{sentLines.length === 1 ? "" : "s"} added</span>
            </div>
            <p className="text-sm text-muted-foreground">Items taken from the shelf for this order, and what is available now.</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {notice && (
              <p role={notice.ok ? "status" : "alert"} className={cn("rounded-lg border px-3 py-2 text-sm", notice.ok ? "border-success/25 bg-success/10 text-success" : "border-destructive/30 bg-destructive/10 text-destructive")}>
                {notice.text}
              </p>
            )}
            <div className={cn("grid divide-x divide-border rounded-lg bg-muted p-4", showCosts ? "grid-cols-2" : "grid-cols-1")} data-testid="sent-summary">
              <div className="flex flex-col gap-1 pr-4">
                <span className="text-xs text-muted-foreground">Total items sent</span>
                <span className="text-2xl font-semibold" data-testid="sent-total">{sentLines.length === 0 ? "—" : sentTotalText}</span>
              </div>
              {showCosts && (
              <div className="flex flex-col gap-1 pl-4" data-testid="sent-cost">
                <span className="text-xs text-muted-foreground">Total cost (batch cost)</span>
                <span className="text-2xl font-semibold">{sentLines.length === 0 ? "—" : formatRupees(sentLines.reduce((sum, l) => sum + l.sentCost, 0))}</span>
                {sentLines.some((l) => l.sentCostUnknown > 0) && <span className="text-xs text-muted-foreground">Leaves out stock whose cost is not known.</span>}
              </div>
              )}
            </div>
            {sentLines.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-border">
                <Table>
                  <TableHeader className="bg-muted">
                    <TableRow>
                      <TableHead className={HEAD}>Item</TableHead>
                      <TableHead className={HEAD}>Qty sent</TableHead>
                      {showCosts && <TableHead className={HEAD}>Batch cost</TableHead>}
                      {showCosts && <TableHead className={HEAD}>Total cost</TableHead>}
                      <TableHead className={`${HEAD} w-12`}><span className="sr-only">Return to stock</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sentLines.map((line) => {
                      const costed = line.sent - line.sentCostUnknown;
                      return (
                        <TableRow key={line.inventoryId} data-testid="sent-line">
                          <TableCell className="px-2.5 py-3">
                            <span className="flex items-center gap-3">
                              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                                <Boxes className="size-5" />
                              </span>
                              <span className="flex min-w-0 flex-col">
                                <span className="text-sm font-medium">{line.name}</span>
                                <span className="text-xs text-muted-foreground">{line.forDishes.length > 0 ? `for ${line.forDishes.join(", ")}` : line.extra > 0 ? "extra item" : ""}</span>
                                <span className={cn("text-xs font-medium", line.inStock > 0 ? "text-success" : "text-destructive")} data-testid="sent-available">
                                  {num(line.inStock)} {line.unit} available
                                </span>
                              </span>
                            </span>
                          </TableCell>
                          <TableCell className="px-2.5 py-3 text-sm whitespace-nowrap" data-testid="sent-quantity">{num(line.sent)} {line.unit}</TableCell>
                          {showCosts && <TableCell className="px-2.5 py-3 text-sm whitespace-nowrap">{costed > 0 ? `${formatRupees(line.sentCost / costed)} / ${line.unit}` : "—"}</TableCell>}
                          {showCosts && (
                            <TableCell className="px-2.5 py-3 text-sm font-semibold whitespace-nowrap">
                              {costed > 0 ? formatRupees(line.sentCost) : "—"}
                              {line.sentCostUnknown > 0 && <span className="block text-xs font-normal text-muted-foreground">cost of {num(line.sentCostUnknown)} {line.unit} unknown</span>}
                            </TableCell>
                          )}
                          <TableCell className="px-2.5 py-3 text-right">
                            {canEdit && data.canReturn && (
                              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Return ${line.name} to stock`} title="Return to stock" disabled={busyId === line.inventoryId} onClick={() => giveBack(line)}>
                                <Undo2 className="size-4 text-info" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
            <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-border bg-muted/40 px-4 py-8 text-center">
              <span className="mb-1 flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Box className="size-6" />
              </span>
              <p className="text-sm font-medium">{sentLines.length === 0 ? "Nothing has been sent to this order yet." : "No other items sent yet."}</p>
              <p className="text-xs text-muted-foreground">Items will appear here once you mark them as sent to this order.</p>
            </div>
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
