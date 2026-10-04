"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DrawerForm, FormDrawer } from "@/components/catalog/form-drawer";
import { formatRupees } from "@/components/catalog/catalog-display";
import { deleteSupplierPaymentAction, recordSupplierPaymentAction } from "../../purchasing/actions";

const METHODS: Record<string, string> = { NONE: "Not specified", UPI: "UPI", CARD: "Card", NET_BANKING: "Net Banking", CASH: "Cash", BANK_TRANSFER: "Bank Transfer" };
const todayIso = () => new Date().toISOString().slice(0, 10);

export interface PaymentRow {
  id: string;
  amount: number;
  paidAt: string;
  method: string | null;
  note: string | null;
}

/** What has been paid to this supplier, with a form to record another and (for those who may) remove a mistake. */
export function SupplierPayments({ supplierId, payments, canRecord, canDelete }: { supplierId: string; payments: PaymentRow[]; canRecord: boolean; canDelete: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(todayIso());
  const [method, setMethod] = useState("NONE");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const result = await recordSupplierPaymentAction(supplierId, { amount: Number.parseFloat(amount), paidAt, method, note });
    setPending(false);
    if (!result.ok) return setError(result.error);
    setOpen(false);
    setAmount("");
    setNote("");
    router.refresh();
  }

  async function remove(id: string) {
    const result = await deleteSupplierPaymentAction(supplierId, id);
    if (!result.ok) setError(result.error);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {canRecord && (
        <Button className="self-start" onClick={() => setOpen(true)}>
          <Plus /> Record payment
        </Button>
      )}
      {payments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Note</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              {canDelete && <TableHead className="w-12" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{new Date(p.paidAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</TableCell>
                <TableCell>{p.method ? (METHODS[p.method] ?? p.method) : "—"}</TableCell>
                <TableCell>{p.note ?? "—"}</TableCell>
                <TableCell className="text-right font-medium">{formatRupees(p.amount)}</TableCell>
                {canDelete && (
                  <TableCell>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Delete payment" onClick={() => void remove(p.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <FormDrawer open={open} onOpenChange={setOpen} title="Record payment" description="Money paid to this supplier. It reduces what you owe them.">
        <DrawerForm onSubmit={submit} error={error} pending={pending} submitLabel="Save payment" onCancel={() => setOpen(false)}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sp-amount">Amount (₹)</Label>
            <Input id="sp-amount" type="number" min="0" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sp-date">Date paid</Label>
            <Input id="sp-date" type="date" required value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sp-method">Method</Label>
            <Select items={METHODS} value={method} onValueChange={(v) => setMethod(v ?? "NONE")}>
              <SelectTrigger id="sp-method" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(METHODS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sp-note">Note</Label>
            <Textarea id="sp-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </DrawerForm>
      </FormDrawer>
    </div>
  );
}
