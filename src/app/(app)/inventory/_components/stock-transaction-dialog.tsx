"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DrawerForm, FormDrawer, useIsDirty } from "@/components/catalog/form-drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { recordStockTransactionAction } from "../actions";

const TYPE_OPTIONS = [
  { value: "STOCK_IN", label: "Stock In" },
  { value: "STOCK_OUT", label: "Stock Out" },
  { value: "ADJUSTMENT", label: "Adjustment" },
] as const;

interface StockTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  name: string;
  unit: string;
  currentStock: number;
  /** The item tracks expiry, so a new batch needs an expiry date. */
  tracksExpiry: boolean;
}

export function StockTransactionDialog({ open, onOpenChange, itemId, name, unit, currentStock, tracksExpiry }: StockTransactionDialogProps) {
  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title={`Stock Movement — ${name}`}>
      <StockTransactionForm onOpenChange={onOpenChange} itemId={itemId} unit={unit} currentStock={currentStock} tracksExpiry={tracksExpiry} />
    </FormDrawer>
  );
}

// The form lives inside the drawer so its state starts fresh every time the drawer opens (and a discard really discards).
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function StockTransactionForm({
  onOpenChange,
  itemId,
  unit,
  currentStock,
  tracksExpiry,
}: Pick<StockTransactionDialogProps, "onOpenChange" | "itemId" | "unit" | "currentStock" | "tracksExpiry">) {
  const router = useRouter();
  const [type, setType] = useState<(typeof TYPE_OPTIONS)[number]["value"]>("STOCK_IN");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  // The batch a Stock In (or a positive adjustment) starts: what it cost, when it expires, which lot.
  const [unitCost, setUnitCost] = useState("");
  const [costUnknown, setCostUnknown] = useState(false);
  const [costNote, setCostNote] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const dirty = useIsDirty({ type, quantity, note, unitCost, costUnknown, costNote, expiryDate, lotNumber });
  const startsBatch = type === "STOCK_IN" || (type === "ADJUSTMENT" && Number.parseFloat(quantity) > 0);
  const isFree = type === "STOCK_IN" && !costUnknown && unitCost.trim() !== "" && Number.parseFloat(unitCost) === 0;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (type === "STOCK_IN" && !costUnknown && unitCost.trim() === "") return setError("Enter the unit cost, or tick Cost unknown.");
    if (isFree && costNote.trim().length < 3) return setError("A unit cost of 0 means free goods. Say why (for example a free sample).");
    if (startsBatch && tracksExpiry && !expiryDate) return setError("Enter an expiry date: this item tracks expiry.");
    setPending(true);

    const formData = new FormData();
    formData.set("type", type);
    formData.set("quantity", quantity);
    formData.set("note", note);
    if (type === "STOCK_IN") {
      formData.set("costUnknown", String(costUnknown));
      if (!costUnknown) formData.set("unitCost", unitCost);
      if (isFree) formData.set("costNote", costNote);
    }
    if (startsBatch) {
      if (expiryDate) formData.set("expiryDate", expiryDate);
      if (lotNumber) formData.set("lotNumber", lotNumber);
    }

    const result = await recordStockTransactionAction(itemId, formData);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onOpenChange(false);
    setQuantity("");
    setNote("");
    router.refresh();
  }

  return (
    <DrawerForm dirty={dirty} onSubmit={handleSubmit} error={error} pending={pending} submitLabel="Record movement" onCancel={() => onOpenChange(false)}>
      <p className="text-sm text-muted-foreground">
        Current stock: <span className="font-medium text-foreground">{currentStock}</span> {unit}
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="stock-type">Type</Label>
        <Select items={Object.fromEntries(TYPE_OPTIONS.map((o) => [o.value, o.label]))} value={type} onValueChange={(v) => setType((v as typeof type) ?? type)}>
          <SelectTrigger id="stock-type" className="w-full">
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
        <Input id="stock-quantity" type="number" step="0.001" required value={quantity} onChange={(e) => setQuantity(e.target.value)} />
      </div>
      {type === "STOCK_IN" && (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
          <Label htmlFor="stock-cost">Unit cost (₹ per {unit})</Label>
          <Input id="stock-cost" type="number" min="0" step="0.01" disabled={costUnknown} value={costUnknown ? "" : unitCost} onChange={(e) => setUnitCost(e.target.value)} />
          <label className="flex items-center gap-2 text-sm" htmlFor="stock-cost-unknown">
            <Checkbox id="stock-cost-unknown" checked={costUnknown} onCheckedChange={(checked) => setCostUnknown(checked === true)} />
            Cost unknown (it can be confirmed later from the item&apos;s Batches)
          </label>
          {isFree && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="stock-cost-note">Why is it free?</Label>
              <Input id="stock-cost-note" maxLength={300} placeholder="Free sample, complimentary goods…" value={costNote} onChange={(e) => setCostNote(e.target.value)} />
            </div>
          )}
        </div>
      )}
      {startsBatch && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="stock-expiry">Expiry date{tracksExpiry ? "" : " (optional)"}</Label>
            <DateRangePicker
              id="stock-expiry"
              ariaLabel="Expiry date"
              single
              placeholder="Pick a date"
              minDate={todayIso()}
              startDate={expiryDate}
              endDate={expiryDate}
              onChange={(d) => setExpiryDate(d)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="stock-lot">Lot number (optional)</Label>
            <Input id="stock-lot" maxLength={60} value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} />
          </div>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="stock-note">Note</Label>
        <Textarea id="stock-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </DrawerForm>
  );
}
