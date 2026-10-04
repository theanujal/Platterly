"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PackageMinus } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { takeOrderStockAction } from "../../../kitchen-dashboard/production/actions";

export interface StockPlanData {
  guests: number;
  servings: number;
  extraPercent: number;
  lines: { inventoryId: string; name: string; unit: string; needed: number; inStock: number; short: number; forDishes: string[] }[];
  withoutRecipe: string[];
  deductedAt: string | null;
  taken: { name: string; unit: string; quantity: number; note: string | null }[];
  canTake: boolean;
  sentToKitchen: boolean;
}

/**
 * Ingredients this order needs from the store, worked out from each dish's recipe (AJ, 2026-10-04). Once the order is
 * with the kitchen the person reviews the needs and confirms, and only then is the stock taken, once.
 */
export function StockPlanCard({ orderId, plan, canConfirm }: { orderId: string; plan: StockPlanData; canConfirm: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const shortLines = plan.lines.filter((l) => l.short > 0);

  async function confirm() {
    setPending(true);
    setError(null);
    const response = await takeOrderStockAction(orderId);
    setPending(false);
    if (!response.ok) return setError(response.error);
    setOpen(false);
    setResult(response.shortages.length > 0 ? `Stock taken. Short on: ${response.shortages.map((s) => `${s.name} (${s.short})`).join(", ")}. Order more with Purchasing.` : "Stock taken.");
    router.refresh();
  }

  return (
    <Card data-testid="stock-plan-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Stock needed for this order
          {plan.deductedAt && <Badge variant="success">Stock taken</Badge>}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {plan.guests > 0
            ? `${plan.guests} guests plus ${plan.extraPercent}% extra, so every dish is cooked for ${plan.servings}. Quantities come from each dish's recipe.`
            : "Add the guest count to the order to see what it needs."}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {plan.lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing to work out yet: either no dish on this order has a recipe, or the guest count is missing. Add recipes on the Food Items page.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ingredient</TableHead>
                <TableHead>Needed</TableHead>
                <TableHead>In stock</TableHead>
                <TableHead>For</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plan.lines.map((l) => (
                <TableRow key={l.inventoryId}>
                  <TableCell className="font-medium">{l.name}</TableCell>
                  <TableCell>
                    {l.needed} {l.unit}
                  </TableCell>
                  <TableCell>
                    {l.inStock} {l.unit} {!plan.deductedAt && l.short > 0 && <Badge variant="danger">Short by {l.short}</Badge>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{l.forDishes.join(", ")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {plan.withoutRecipe.length > 0 && (
          <p className="text-sm text-muted-foreground">
            <Badge variant="warning">No recipe</Badge> {plan.withoutRecipe.join(", ")} (not counted above)
          </p>
        )}

        {plan.deductedAt && (
          <div className="text-sm">
            <p className="font-medium">Taken from stock on {new Date(plan.deductedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
            <ul className="mt-1 text-muted-foreground">
              {plan.taken.map((t, i) => (
                <li key={i}>
                  {t.name}: {t.quantity} {t.unit}
                  {t.note?.includes("short") ? ` (${t.note.slice(t.note.indexOf("short"))}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!plan.deductedAt && !plan.sentToKitchen && <p className="text-sm text-muted-foreground">Stock is taken once this order is sent to the kitchen.</p>}
        {result && (
          <p role="status" className="text-sm font-medium">
            {result}
          </p>
        )}

        {plan.canTake && canConfirm && (
          <Button className="self-start" onClick={() => setOpen(true)}>
            <PackageMinus /> Review and take stock
          </Button>
        )}
        {plan.canTake && !canConfirm && <p className="text-sm text-muted-foreground">Ask someone who can change inventory to confirm the stock.</p>}
      </CardContent>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Take this stock now?</AlertDialogTitle>
            <AlertDialogDescription>
              The quantities listed are taken out of inventory once and cannot be taken again for this order.
              {shortLines.length > 0 ? ` Not enough in stock for ${shortLines.map((l) => `${l.name} (short by ${l.short} ${l.unit})`).join(", ")}: what is there is taken, down to zero.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                void confirm();
              }}
            >
              {pending ? "Taking…" : "Confirm and take stock"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
