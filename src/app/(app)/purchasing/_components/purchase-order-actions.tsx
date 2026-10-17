"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCheck, ClipboardList, Copy, PackageCheck, Pencil, Trash2, XCircle } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { DrawerForm, FormDrawer, useIsDirty } from "@/components/catalog/form-drawer";
import { cancelPurchaseOrderAction, deletePurchaseOrderAction, markOrderedAction, receiveStockAction, type ActionResult } from "../actions";

export interface ReceiveLine {
  itemId: string;
  name: string;
  unit: string;
  remaining: number;
  /** Perishable items must have an expiry date. */
  expiryRequired: boolean;
  /** The item's last known cost, shown as a hint. */
  lastCost: number | null;
}

type Confirm = { title: string; text: string; label: string; cancelLabel?: string; run: () => Promise<ActionResult>; destructive?: boolean; then?: "list" | "stay" };

/** The buttons that move a purchase order along, each asking first where it cannot be undone. */
export function PurchaseOrderActions({
  id,
  number,
  status,
  receiveLines,
  canEdit,
  canDelete,
  supplierName,
  message,
  waLink,
  hasReceipts,
  orderPlacedOn,
}: {
  id: string;
  number: string;
  status: "DRAFT" | "ORDERED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED";
  receiveLines: ReceiveLine[];
  canEdit: boolean;
  canDelete: boolean;
  supplierName: string;
  /** The WhatsApp text for this order (no prices). */
  message: string;
  /** Click-to-chat link with the message; null when the supplier has no usable phone number. */
  waLink: string | null;
  hasReceipts: boolean;
  /** YYYY-MM-DD the order was raised; a delivery cannot be dated before it. */
  orderPlacedOn: string;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [noPhoneOpen, setNoPhoneOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function runConfirmed() {
    if (!confirm) return;
    setPending(true);
    setError(null);
    const result = await confirm.run();
    setPending(false);
    if (!result.ok) return setError(result.error);
    const then = confirm.then;
    setConfirm(null);
    if (then === "list") router.push("/purchasing");
    router.refresh();
  }

  // A receipt books prices, so it is offered only to a viewer the page gave receipt lines (the supplier-costs right).
  const canReceive = (status === "ORDERED" || status === "PARTIALLY_RECEIVED") && receiveLines.length > 0;

  // Opening WhatsApp is not sending. The order stays a draft until the person says they sent it.
  const askSent = (why: string): Confirm => ({
    title: "Have you sent this purchase order to the supplier?",
    text: `${why} ${number} is marked as ordered only after you confirm.`,
    label: "Yes, I sent it",
    cancelLabel: "Not yet",
    run: () => markOrderedAction(id),
  });
  async function copyDetails() {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {canEdit && status === "DRAFT" && (
          <>
            <Button variant="outline" render={<Link href={`/purchasing/${id}/edit`} />} nativeButton={false}>
              <Pencil /> Edit
            </Button>
            {waLink ? (
              <Button
                render={<a href={waLink} target="_blank" rel="noopener noreferrer" />}
                nativeButton={false}
                onClick={() => setConfirm(askSent(`WhatsApp opened with the order for ${supplierName}.`))}
              >
                <WhatsAppIcon className="size-4" /> Send via WhatsApp
              </Button>
            ) : (
              <Button onClick={() => setNoPhoneOpen(true)}>
                <WhatsAppIcon className="size-4" /> Send via WhatsApp
              </Button>
            )}
            <Button variant="outline" onClick={() => setConfirm(askSent("You placed this order another way."))}>
              <PackageCheck /> Mark as ordered
            </Button>
          </>
        )}
        {canEdit && canReceive && (
          <Button onClick={() => setReceiveOpen(true)}>
            <PackageCheck /> {status === "PARTIALLY_RECEIVED" ? "Receive remaining stock" : "Receive stock"}
          </Button>
        )}
        {(status === "RECEIVED" || (hasReceipts && status === "CANCELLED")) && (
          <Button variant="outline" render={<a href="#receipts" />} nativeButton={false}>
            <ClipboardList /> View receipt history
          </Button>
        )}
        {canEdit && (status === "DRAFT" || status === "ORDERED") && (
          <Button
            variant="outline"
            onClick={() =>
              setConfirm({
                title: `Cancel ${number}?`,
                text: "The order is kept in the list as cancelled.",
                label: "Cancel order",
                run: () => cancelPurchaseOrderAction(id),
                destructive: true,
              })
            }
          >
            <XCircle /> Cancel order
          </Button>
        )}
        {canDelete && (status === "DRAFT" || status === "CANCELLED") && (
          <Button
            variant="outline"
            onClick={() =>
              setConfirm({
                title: `Delete ${number}?`,
                text: "This removes the order for good.",
                label: "Delete",
                run: () => deletePurchaseOrderAction(id),
                destructive: true,
                then: "list",
              })
            }
          >
            <Trash2 /> Delete
          </Button>
        )}
      </div>
      {canEdit && status === "DRAFT" && (
        <p className="mt-2 text-sm text-muted-foreground" data-testid="draft-receive-hint">
          Mark this order as ordered to receive stock against it.
        </p>
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.text}</AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>{confirm?.cancelLabel ?? "Back"}</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm?.destructive ? "destructive" : "default"}
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                void runConfirmed();
              }}
            >
              {pending ? "Working…" : confirm?.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={noPhoneOpen} onOpenChange={setNoPhoneOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>No WhatsApp number for {supplierName}</AlertDialogTitle>
            <AlertDialogDescription>
              This supplier has no phone number, or it is not a valid number, so WhatsApp cannot be opened. Copy the order details and send them another way, or add a number in the
              supplier&apos;s details.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <pre className="max-h-48 overflow-y-auto rounded-lg bg-muted p-3 text-sm whitespace-pre-wrap">{message}</pre>
          <AlertDialogFooter>
            <Button type="button" variant="outline" onClick={() => void copyDetails()}>
              <Copy /> {copied ? "Copied!" : "Copy order details"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setNoPhoneOpen(false);
                setConfirm(askSent("You are sending it another way."));
              }}
            >
              I sent it another way
            </Button>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {receiveOpen && <ReceiveDrawer id={id} number={number} lines={receiveLines} orderPlacedOn={orderPlacedOn} onClose={() => setReceiveOpen(false)} />}
    </>
  );
}

interface LineValues {
  quantity: string;
  unitCost: string;
  costNote: string;
  expiryDate: string;
  lotNumber: string;
  authoriseExtra: boolean;
  extraReason: string;
}

const EMPTY_LINE: LineValues = { quantity: "", unitCost: "", costNote: "", expiryDate: "", lotNumber: "", authoriseExtra: false, extraReason: "" };

const todayInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function ReceiveDrawer({ id, number, lines, orderPlacedOn, onClose }: { id: string; number: string; lines: ReceiveLine[]; orderPlacedOn: string; onClose: () => void }) {
  const router = useRouter();
  // One key per opening of the drawer: if the same submission is sent twice (a double click, a retry after a lost reply)
  // the second one is recognised and adds nothing.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [header, setHeader] = useState({ receivedDate: todayInput(), invoiceNumber: "", notes: "" });
  const [values, setValues] = useState<Record<string, LineValues>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const dirty = useIsDirty({ header, values });
  const open = lines.filter((l) => l.remaining > 0);
  const valueOf = (itemId: string): LineValues => values[itemId] ?? EMPTY_LINE;
  const setLine = (itemId: string, patch: Partial<LineValues>) => setValues((v) => ({ ...v, [itemId]: { ...valueOf(itemId), ...patch } }));
  const today = todayInput();
  // A delivery cannot already have expired: the earliest expiry is today, or the received date if that is later.
  const earliestExpiry = header.receivedDate > today ? header.receivedDate : today;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!header.receivedDate) return setError("Enter the date the stock was received.");
    const entered = open.filter((l) => Number.parseFloat(valueOf(l.itemId).quantity) > 0);
    if (entered.length === 0) return setError("Enter a quantity for at least one item.");
    for (const l of entered) {
      const v = valueOf(l.itemId);
      const quantity = Number.parseFloat(v.quantity);
      const cost = Number.parseFloat(v.unitCost);
      if (v.unitCost.trim() === "" || Number.isNaN(cost)) return setError(`Enter the unit cost paid for ${l.name}.`);
      if (cost < 0) return setError(`The unit cost for ${l.name} cannot be negative.`);
      if (cost === 0 && v.costNote.trim().length < 3) return setError(`${l.name} has a unit cost of 0. Say why it is free (for example a free sample).`);
      if (quantity > l.remaining + 0.0005 && (!v.authoriseExtra || v.extraReason.trim().length < 3))
        return setError(`${l.name}: ${quantity} is more than the ${l.remaining} still to arrive. Authorise the extra and give the reason, or enter the ordered amount.`);
      if (l.expiryRequired && !v.expiryDate) return setError(`Enter an expiry date for ${l.name}.`);
    }
    setPending(true);
    const result = await receiveStockAction(id, {
      idempotencyKey,
      receivedDate: header.receivedDate,
      invoiceNumber: header.invoiceNumber,
      notes: header.notes,
      lines: entered.map((l) => {
        const v = valueOf(l.itemId);
        const quantity = Number.parseFloat(v.quantity);
        return {
          itemId: l.itemId,
          quantity,
          unitCost: Number.parseFloat(v.unitCost),
          costNote: Number.parseFloat(v.unitCost) === 0 ? v.costNote : "",
          extraReason: quantity > l.remaining + 0.0005 ? v.extraReason : "",
          expiryDate: v.expiryDate,
          lotNumber: v.lotNumber,
        };
      }),
    });
    setPending(false);
    if (!result.ok) return setError(result.error);
    onClose();
    router.refresh();
  }

  return (
    <FormDrawer
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={`Receive stock — ${number}`}
      description="Enter what arrived and what it cost. Each delivery is added to your stock as its own batch; leave the rest for the next delivery."
    >
      <DrawerForm dirty={dirty} onSubmit={submit} error={error} pending={pending} submitLabel="Add to stock" onCancel={onClose}>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-accent px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-accent-foreground">Did everything arrive as ordered?</p>
            <p className="text-xs text-muted-foreground">
              Fills every quantity with what is still to arrive. You still enter the cost{open.some((l) => l.expiryRequired) ? " and expiry date" : ""} for each item.
            </p>
          </div>
          <Button
            type="button"
            onClick={() =>
              setValues((v) =>
                Object.fromEntries(open.map((l) => [l.itemId, { ...EMPTY_LINE, ...(v[l.itemId] ?? {}), quantity: String(l.remaining), authoriseExtra: false, extraReason: "" }])),
              )
            }
          >
            <CheckCheck /> Everything has arrived
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recv-date">Received on</Label>
            <DateRangePicker
              id="recv-date"
              ariaLabel="Received on"
              single
              placeholder="Pick a date"
              minDate={orderPlacedOn}
              maxDate={today}
              startDate={header.receivedDate}
              endDate={header.receivedDate}
              onChange={(d) => setHeader((h) => ({ ...h, receivedDate: d }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recv-invoice">Invoice number (optional)</Label>
            <Input id="recv-invoice" maxLength={60} value={header.invoiceNumber} onChange={(e) => setHeader((h) => ({ ...h, invoiceNumber: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recv-notes">Notes (optional)</Label>
            <Input id="recv-notes" maxLength={1000} value={header.notes} onChange={(e) => setHeader((h) => ({ ...h, notes: e.target.value }))} />
          </div>
        </div>
        {open.map((l) => {
          const v = valueOf(l.itemId);
          const quantity = Number.parseFloat(v.quantity);
          const extra = quantity > l.remaining + 0.0005 ? Math.round((quantity - l.remaining) * 1000) / 1000 : 0;
          const free = v.unitCost.trim() !== "" && Number.parseFloat(v.unitCost) === 0;
          return (
            <div key={l.itemId} className="flex flex-col gap-3 rounded-lg border border-border p-4">
              <p className="text-sm font-medium">
                {l.name}{" "}
                <span className="font-normal text-muted-foreground">
                  ({l.remaining} {l.unit} still to arrive{l.lastCost !== null ? ` · last cost ₹${l.lastCost}` : ""})
                </span>
              </p>
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`recv-${l.itemId}`}>Quantity received ({l.unit})</Label>
                  <Input
                    id={`recv-${l.itemId}`}
                    aria-label={`Received ${l.name}`}
                    type="number"
                    min="0"
                    step="0.001"
                    value={v.quantity}
                    onChange={(e) => setLine(l.itemId, { quantity: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`cost-${l.itemId}`}>Unit cost (₹ per {l.unit})</Label>
                  <Input
                    id={`cost-${l.itemId}`}
                    aria-label={`Unit cost ${l.name}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={v.unitCost}
                    onChange={(e) => setLine(l.itemId, { unitCost: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`exp-${l.itemId}`}>Expiry date{l.expiryRequired ? "" : " (optional)"}</Label>
                  <DateRangePicker
                    id={`exp-${l.itemId}`}
                    ariaLabel={`Expiry ${l.name}`}
                    single
                    placeholder="Pick a date"
                    minDate={earliestExpiry}
                    startDate={v.expiryDate}
                    endDate={v.expiryDate}
                    onChange={(d) => setLine(l.itemId, { expiryDate: d })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`lot-${l.itemId}`}>Lot number (optional)</Label>
                  <Input
                    id={`lot-${l.itemId}`}
                    aria-label={`Lot ${l.name}`}
                    maxLength={60}
                    value={v.lotNumber}
                    onChange={(e) => setLine(l.itemId, { lotNumber: e.target.value })}
                  />
                </div>
              </div>
              {free && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`free-${l.itemId}`}>Unit cost is 0: why is it free?</Label>
                  <Input
                    id={`free-${l.itemId}`}
                    aria-label={`Free reason ${l.name}`}
                    maxLength={300}
                    placeholder="Free sample, complimentary goods…"
                    value={v.costNote}
                    onChange={(e) => setLine(l.itemId, { costNote: e.target.value })}
                  />
                </div>
              )}
              {extra > 0 && (
                <div className="flex flex-col gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3" data-testid="extra-delivery">
                  <p className="text-sm font-medium text-warning">
                    {extra} {l.unit} more than ordered. It is not added unless you authorise it.
                  </p>
                  <label className="flex items-center gap-2 text-sm" htmlFor={`extra-${l.itemId}`}>
                    <Checkbox
                      id={`extra-${l.itemId}`}
                      aria-label={`Authorise extra ${l.name}`}
                      checked={v.authoriseExtra}
                      onCheckedChange={(checked) => setLine(l.itemId, { authoriseExtra: checked === true })}
                    />
                    Authorise the extra {extra} {l.unit}, booked at the cost above
                  </label>
                  {v.authoriseExtra && (
                    <Input
                      aria-label={`Extra reason ${l.name}`}
                      maxLength={300}
                      placeholder="Why is the extra being accepted?"
                      value={v.extraReason}
                      onChange={(e) => setLine(l.itemId, { extraReason: e.target.value })}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </DrawerForm>
    </FormDrawer>
  );
}
