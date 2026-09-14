"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PackagePlus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { recordStockTransactionAction } from "../actions";

const TYPE_OPTIONS = [
  { value: "STOCK_IN", label: "Stock In" },
  { value: "STOCK_OUT", label: "Stock Out" },
  { value: "ADJUSTMENT", label: "Adjustment" },
] as const;

interface StockTransactionDialogProps {
  itemId: string;
  name: string;
  unit: string;
  currentStock: number;
}

export function StockTransactionDialog({ itemId, name, unit, currentStock }: StockTransactionDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<(typeof TYPE_OPTIONS)[number]["value"]>("STOCK_IN");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const formData = new FormData();
    formData.set("type", type);
    formData.set("quantity", quantity);
    formData.set("note", note);

    const result = await recordStockTransactionAction(itemId, formData);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    setQuantity("");
    setNote("");
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Record stock movement for ${name}`} />}>
        <PackagePlus className="size-4" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Stock Movement — {name}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Current stock: <span className="font-medium text-foreground">{currentStock}</span> {unit}
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="stock-type">Type</Label>
            <Select value={type} onValueChange={(v) => setType((v as typeof type) ?? type)}>
              <SelectTrigger id="stock-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="stock-quantity">
              {type === "ADJUSTMENT" ? "Adjustment (+ or -)" : "Quantity"} ({unit})
            </Label>
            <Input
              id="stock-quantity"
              type="number"
              step="0.01"
              required
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="stock-note">Note</Label>
            <Textarea id="stock-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={pending} className="self-start">
            {pending ? "Saving…" : "Record movement"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
