"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, Copy, PackageCheck, Pencil, Trash2, XCircle } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DrawerForm, FormDrawer, useIsDirty } from "@/components/catalog/form-drawer";
import { cancelPurchaseOrderAction, deletePurchaseOrderAction, markOrderedAction, receiveStockAction, type ActionResult } from "../actions";

export interface ReceiveLine {
  itemId: string;
  name: string;
  unit: string;
  remaining: number;
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

  const canReceive = status === "ORDERED" || status === "PARTIALLY_RECEIVED";

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
              <Button render={<a href={waLink} target="_blank" rel="noopener noreferrer" />} nativeButton={false} onClick={() => setConfirm(askSent(`WhatsApp opened with the order for ${supplierName}.`))}>
                <WhatsAppIcon className="size-4" /> Send via WhatsApp
              </Button>
            ) : (
              <Button onClick={() => setNoPhoneOpen(true)}>
                <WhatsAppIcon className="size-4" /> Send via WhatsApp
              </Button>
            )}
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
          <Button variant="outline" onClick={() => setConfirm({ title: `Cancel ${number}?`, text: "The order is kept in the list as cancelled.", label: "Cancel order", run: () => cancelPurchaseOrderAction(id), destructive: true })}>
            <XCircle /> Cancel order
          </Button>
        )}
        {canDelete && (status === "DRAFT" || status === "CANCELLED") && (
          <Button variant="outline" onClick={() => setConfirm({ title: `Delete ${number}?`, text: "This removes the order for good.", label: "Delete", run: () => deletePurchaseOrderAction(id), destructive: true, then: "list" })}>
            <Trash2 /> Delete
          </Button>
        )}
      </div>

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
            <AlertDialogAction variant={confirm?.destructive ? "destructive" : "default"} disabled={pending} onClick={(e) => { e.preventDefault(); void runConfirmed(); }}>
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
              This supplier has no phone number, or it is not a valid number, so WhatsApp cannot be opened. Copy the order details and send them another way, or add a number in the supplier&apos;s details.
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

      {receiveOpen && <ReceiveDrawer id={id} number={number} lines={receiveLines} onClose={() => setReceiveOpen(false)} />}
    </>
  );
}

function ReceiveDrawer({ id, number, lines, onClose }: { id: string; number: string; lines: ReceiveLine[]; onClose: () => void }) {
  const router = useRouter();
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const dirty = useIsDirty(quantities);
  const open = lines.filter((l) => l.remaining > 0);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const result = await receiveStockAction(id, open.map((l) => ({ itemId: l.itemId, quantity: Number.parseFloat(quantities[l.itemId] ?? "") || 0 })));
    setPending(false);
    if (!result.ok) return setError(result.error);
    onClose();
    router.refresh();
  }

  return (
    <FormDrawer open onOpenChange={(o) => !o && onClose()} title={`Receive stock — ${number}`} description="Enter what arrived. It is added to your stock straight away; leave the rest for the next delivery.">
      <DrawerForm dirty={dirty} onSubmit={submit} error={error} pending={pending} submitLabel="Add to stock" onCancel={onClose}>
        <Button type="button" variant="outline" className="self-start" onClick={() => setQuantities(Object.fromEntries(open.map((l) => [l.itemId, String(l.remaining)])))}>
          Everything has arrived
        </Button>
        {open.map((l) => (
          <div key={l.itemId} className="flex flex-col gap-1.5">
            <Label htmlFor={`recv-${l.itemId}`}>
              {l.name} <span className="font-normal text-muted-foreground">({l.remaining} {l.unit} still to arrive)</span>
            </Label>
            <Input id={`recv-${l.itemId}`} aria-label={`Received ${l.name}`} type="number" min="0" max={l.remaining} step="0.001" value={quantities[l.itemId] ?? ""} onChange={(e) => setQuantities((q) => ({ ...q, [l.itemId]: e.target.value }))} />
          </div>
        ))}
      </DrawerForm>
    </FormDrawer>
  );
}
