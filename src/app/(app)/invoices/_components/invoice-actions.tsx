"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Download, Receipt, Send } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IconInput } from "@/components/ui/icon-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cancelInvoiceAction, createInvoiceAction, sendInvoiceAction } from "../actions";

export function InvoiceHeaderActions({ invoiceId, type, canSend, canCancel, cancellable }: { invoiceId: string; type: "INVOICE" | "RECEIPT"; canSend: boolean; canCancel: boolean; cancellable: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(task: () => ReturnType<typeof sendInvoiceAction>, fallback: string) {
    setPending(true);
    const result = await task();
    setPending(false);
    setNotice(result.ok ? { ok: true, text: result.message ?? fallback } : { ok: false, text: result.error });
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="md" render={<a href={`/invoices/${invoiceId}/pdf`} download />} nativeButton={false}>
          <Download />
          Download PDF
        </Button>
        {canSend && (
          <Button type="button" variant="outline" size="md" disabled={pending} onClick={() => run(() => sendInvoiceAction(invoiceId), "Sent.")}>
            <Send />
            {type === "RECEIPT" ? "Send Receipt" : "Send Invoice"}
          </Button>
        )}
        {canCancel && cancellable && type === "INVOICE" && (
          <Button type="button" variant="outline" size="md" className="text-destructive" disabled={pending} onClick={() => run(() => cancelInvoiceAction(invoiceId), "Invoice cancelled.")}>
            Cancel Invoice
          </Button>
        )}
      </div>
      {notice && (
        <p role={notice.ok ? "status" : "alert"} className={notice.ok ? "max-w-sm text-right text-sm text-success" : "max-w-sm text-right text-sm text-destructive"}>
          {notice.text}
        </p>
      )}
    </div>
  );
}

/** "Create Invoice" on the Order page. GST fields only appear when the kitchen has GST on its invoices. */
export function CreateInvoiceButton({ orderId, gstEnabled, defaultDueDate }: { orderId: string; gstEnabled: boolean; defaultDueDate: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [gstType, setGstType] = useState("CGST_SGST");
  const [gstRate, setGstRate] = useState("5");
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setError(null);
    setPending(true);
    const result = await createInvoiceAction(orderId, { gstType: gstType === "IGST" ? "IGST" : "CGST_SGST", gstRate: Number(gstRate), dueDate });
    setPending(false);
    if (!result.ok) return setError(result.error);
    setOpen(false);
    router.push(`/invoices/${result.invoiceId}`);
  }

  return (
    <>
      <Button type="button" variant="outline" size="md" onClick={() => setOpen(true)}>
        <Receipt />
        Create Invoice
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Create Invoice</DialogTitle>
            <DialogDescription>The invoice lists this order&apos;s items and always totals the order amount.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inv-due">Due date</Label>
              <IconInput icon={Check} id="inv-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            {gstEnabled && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="inv-gst-type">GST type</Label>
                  <Select items={{ CGST_SGST: "CGST + SGST", IGST: "IGST" }} value={gstType} onValueChange={(v) => setGstType(v ?? gstType)}>
                    <SelectTrigger id="inv-gst-type" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CGST_SGST">CGST + SGST</SelectItem>
                      <SelectItem value="IGST">IGST</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="inv-gst-rate">GST rate (%)</Label>
                  <IconInput icon={Check} id="inv-gst-rate" type="number" min={0} max={28} step="0.5" value={gstRate} onChange={(e) => setGstRate(e.target.value)} />
                </div>
                <p className="text-xs text-muted-foreground sm:col-span-2">Your prices include GST, so it is shown inside the total, not added on top.</p>
              </div>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={pending} onClick={submit}>
              {pending ? "Creating…" : "Create Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function OpenInvoiceLink({ invoiceId, number }: { invoiceId: string; number: string }) {
  return (
    <Button variant="outline" size="md" render={<Link href={`/invoices/${invoiceId}`} />} nativeButton={false}>
      <Receipt />
      {number}
    </Button>
  );
}
