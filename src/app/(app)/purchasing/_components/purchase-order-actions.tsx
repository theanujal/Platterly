"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PackageCheck, Pencil, Send, Trash2, XCircle } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DrawerForm, FormDrawer } from "@/components/catalog/form-drawer";
import { cancelPurchaseOrderAction, deletePurchaseOrderAction, markOrderedAction, receiveStockAction, type ActionResult } from "../actions";

export interface ReceiveLine {
  itemId: string;
  name: string;
  unit: string;
  remaining: number;
}

type Confirm = { title: string; text: string; label: string; run: () => Promise<ActionResult>; destructive?: boolean; then?: "list" | "stay" };

/** The buttons that move a purchase order along, each asking first where it cannot be undone. */
export function PurchaseOrderActions({
  id,
  number,
  status,
  receiveLines,
  canEdit,
  canDelete,
}: {
  id: string;
  number: string;
  status: "DRAFT" | "ORDERED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED";
  receiveLines: ReceiveLine[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);

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
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {canEdit && status === "DRAFT" && (
          <>
            <Button variant="outline" render={<Link href={`/purchasing/${id}/edit`} />} nativeButton={false}>
              <Pencil /> Edit
            </Button>
            <Button onClick={() => setConfirm({ title: `Mark ${number} as ordered?`, text: "This says the order has gone to the supplier. The items can no longer be changed.", label: "Mark as ordered", run: () => markOrderedAction(id) })}>
              <Send /> Mark as ordered
            </Button>
          </>
        )}
        {canEdit && canReceive && (
          <Button onClick={() => setReceiveOpen(true)}>
            <PackageCheck /> Receive stock
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
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction variant={confirm?.destructive ? "destructive" : "default"} disabled={pending} onClick={(e) => { e.preventDefault(); void runConfirmed(); }}>
              {pending ? "Working…" : confirm?.label}
            </AlertDialogAction>
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
      <DrawerForm onSubmit={submit} error={error} pending={pending} submitLabel="Add to stock" onCancel={onClose}>
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
