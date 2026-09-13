"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateMemberRoleAction, disableMemberAction, enableMemberAction } from "../actions";

const ROLE_OPTIONS = [
  { value: "admin", label: "Team Admin" },
  { value: "manager", label: "Manager" },
  { value: "staff", label: "Staff" },
] as const;

interface MemberRowActionsProps {
  memberId: string;
  role: string;
  disabled: boolean;
}

export function MemberRowActions({ memberId, role, disabled }: MemberRowActionsProps) {
  const router = useRouter();
  const [pendingRole, setPendingRole] = useState(false);
  const [toggleOpen, setToggleOpen] = useState(false);
  const [pendingToggle, setPendingToggle] = useState(false);

  const isOwner = role === "owner";

  async function handleRoleChange(newRole: string) {
    setPendingRole(true);
    await updateMemberRoleAction(memberId, newRole);
    setPendingRole(false);
    router.refresh();
  }

  async function handleToggle() {
    setPendingToggle(true);
    if (disabled) {
      await enableMemberAction(memberId);
    } else {
      await disableMemberAction(memberId);
    }
    setPendingToggle(false);
    setToggleOpen(false);
    router.refresh();
  }

  if (isOwner) {
    return <span className="text-xs text-muted-foreground">Owner</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={role} onValueChange={(value) => value && handleRoleChange(value)} disabled={pendingRole}>
        <SelectTrigger size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <AlertDialog open={toggleOpen} onOpenChange={setToggleOpen}>
        <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>
          {disabled ? "Enable" : "Disable"}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{disabled ? "Enable this member?" : "Disable this member?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {disabled
                ? "Restores their access to this organization."
                : "They'll be immediately locked out of every part of this organization until re-enabled. Their account and history are kept."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={disabled ? "default" : "destructive"}
              disabled={pendingToggle}
              onClick={handleToggle}
            >
              {pendingToggle ? "Working…" : disabled ? "Enable" : "Disable"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
