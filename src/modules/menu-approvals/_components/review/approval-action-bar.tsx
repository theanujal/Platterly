"use client";

import { Send, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MenuSelectionStatus } from "@/generated/prisma/enums";
import type { ApprovalPending } from "./types";

/**
 * The stage buttons of the review (Save Changes, Send / Send Updated Menu for Approval, Recall to Edit, Approve & Send to Kitchen).
 * Which ones show follows the menu's status exactly as before; `children` is where the page puts its own link (View Order).
 */
export function ApprovalActionBar({
  status,
  hasSentVersion,
  viewingVersion,
  editable,
  withCustomer,
  pending,
  dirty,
  showSave = true,
  onSave,
  onSend,
  onRecall,
  onApprove,
  children,
}: {
  status: MenuSelectionStatus;
  /** A version was sent before, so the button reads "Send Updated Menu for Approval". */
  hasSentVersion: boolean;
  /** A frozen version is on screen: no stage buttons then. */
  viewingVersion: boolean;
  editable: boolean;
  withCustomer: boolean;
  pending: ApprovalPending;
  dirty: boolean;
  /** Off when the order page's own Save buttons save the meal plan (see approval-save-slot.tsx). */
  showSave?: boolean;
  onSave: () => void;
  onSend: () => void;
  onRecall: () => void;
  onApprove: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="menu-approval-actions">
      {children}
      {!viewingVersion && editable && (
        <>
          {showSave && (
            <Button type="button" variant="outline" disabled={pending !== null || !dirty} onClick={onSave}>
              {pending === "save" ? "Saving…" : "Save Changes"}
            </Button>
          )}
          <Button type="button" disabled={pending !== null} onClick={onSend}>
            <Send data-icon="inline-start" />
            {pending === "send" ? "Sending…" : hasSentVersion ? "Send Updated Menu for Approval" : "Send Menu for Approval"}
          </Button>
        </>
      )}
      {!viewingVersion && withCustomer && (
        <Button type="button" variant="outline" disabled={pending !== null} onClick={onRecall}>
          <Undo2 data-icon="inline-start" />
          {pending === "recall" ? "Recalling…" : "Recall to Edit"}
        </Button>
      )}
      {!viewingVersion && status === "CUSTOMER_APPROVED" && (
        <>
          <Button type="button" variant="outline" disabled={pending !== null} onClick={onRecall}>
            <Undo2 data-icon="inline-start" />
            {pending === "recall" ? "Recalling…" : "Recall to Edit"}
          </Button>
          <Button type="button" disabled={pending !== null} onClick={onApprove}>
            {pending === "approve" ? "Sending…" : "Approve & Send to Kitchen"}
          </Button>
        </>
      )}
    </div>
  );
}
