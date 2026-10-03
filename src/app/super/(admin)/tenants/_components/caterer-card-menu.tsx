"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, MoreVertical, Power, PowerOff, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLinkItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { activateTenantAction, deactivateTenantAction, suspendTenantAction } from "../actions";
import type { TenantStatus } from "@/generated/prisma/enums";

const COPY = {
  suspend: { label: "Suspend", title: "Suspend this caterer?", description: "The caterer's team will lose access until reactivated.", variant: "destructive" as const },
  activate: { label: "Activate", title: "Activate this caterer?", description: "Restores the caterer's access.", variant: "default" as const },
  deactivate: { label: "Deactivate", title: "Deactivate this caterer?", description: "This is a soft deactivation: records and history are kept, and it can be reversed by activating again.", variant: "destructive" as const },
};
type Kind = keyof typeof COPY;
const ACTIONS: Record<Kind, (id: string) => Promise<{ ok: boolean; error?: string }>> = { suspend: suspendTenantAction, activate: activateTenantAction, deactivate: deactivateTenantAction };

/**
 * The 3-dot menu on a caterer card (design system §13): Open, then Suspend / Activate and Deactivate. Each status
 * change asks first. The dialog sits beside the menu, not inside it: a dialog owned by a menu item unmounts the
 * moment the menu closes.
 */
export function CatererCardMenu({ tenantId, name, status }: { tenantId: string; name: string; status: TenantStatus }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<Kind | null>(null);
  const [pending, setPending] = useState(false);

  async function run() {
    if (!confirm) return;
    setPending(true);
    await ACTIONS[confirm](tenantId);
    setPending(false);
    setConfirm(null);
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="bg-muted text-muted-foreground hover:bg-muted/70" aria-label={`Actions for ${name}`} />}>
          <MoreVertical />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLinkItem render={<Link href={`/super/tenants/${tenantId}`} />}>
            <ExternalLink />
            Open caterer
          </DropdownMenuLinkItem>
          {status !== "ACTIVE" && (
            <DropdownMenuItem onClick={() => setConfirm("activate")}>
              <Power />
              Activate
            </DropdownMenuItem>
          )}
          {status === "ACTIVE" && (
            <DropdownMenuItem onClick={() => setConfirm("suspend")}>
              <PowerOff />
              Suspend
            </DropdownMenuItem>
          )}
          {status !== "DEACTIVATED" && (
            <DropdownMenuItem variant="destructive" onClick={() => setConfirm("deactivate")}>
              <Trash2 />
              Deactivate
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm ? COPY[confirm].title : ""}</AlertDialogTitle>
            <AlertDialogDescription>
              {name}: {confirm ? COPY[confirm].description : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant={confirm ? COPY[confirm].variant : "default"} disabled={pending} onClick={run}>
              {pending ? "Working…" : confirm ? COPY[confirm].label : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
