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
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { INVITABLE_ROLE_DEFINITIONS, roleLabel } from "@/lib/auth/role-metadata";
import { updateMemberRoleAction, disableMemberAction, enableMemberAction, setMemberLocationAction, removeMemberAction } from "../actions";

const ROLE_OPTIONS = INVITABLE_ROLE_DEFINITIONS.map((r) => ({ value: r.id, label: r.label }));

interface MemberRowActionsProps {
  memberId: string;
  memberName: string;
  role: string;
  disabled: boolean;
  /** Chunk 23: the member's location, and the locations to pick from. Null locations = the feature is off. */
  locationId: string | null;
  locations: { id: string; name: string }[] | null;
}

const ALL_LOCATIONS = "ALL";

export function MemberRowActions({ memberId, memberName, role, disabled, locationId, locations }: MemberRowActionsProps) {
  const router = useRouter();
  const [pendingRole, setPendingRole] = useState(false);
  const [toggleOpen, setToggleOpen] = useState(false);
  const [pendingToggle, setPendingToggle] = useState(false);

  const isOwner = role === "owner";

  // The picked role waits here until the owner confirms it; nothing changes before that.
  const [roleToConfirm, setRoleToConfirm] = useState<string | null>(null);
  async function confirmRoleChange() {
    if (!roleToConfirm) return;
    setPendingRole(true);
    const result = await updateMemberRoleAction(memberId, roleToConfirm);
    setPendingRole(false);
    const newRole = roleToConfirm;
    setRoleToConfirm(null);
    if (!result.ok) return toast.error(result.error);
    toast.success(`${memberName}'s role is now ${roleLabel(newRole)}.`);
    router.refresh();
  }

  const [removeOpen, setRemoveOpen] = useState(false);
  const [pendingRemove, setPendingRemove] = useState(false);
  async function confirmRemove() {
    setPendingRemove(true);
    const result = await removeMemberAction(memberId);
    setPendingRemove(false);
    setRemoveOpen(false);
    if (!result.ok) return toast.error(result.error);
    toast.success(`${memberName} was removed from the team.`);
    router.refresh();
  }

  const [pendingLocation, setPendingLocation] = useState(false);
  async function handleLocationChange(value: string) {
    setPendingLocation(true);
    const result = await setMemberLocationAction(memberId, value === ALL_LOCATIONS ? null : value);
    setPendingLocation(false);
    if (!result.ok) return toast.error(result.error);
    toast.success(`${memberName}'s location was changed.`);
    router.refresh();
  }

  async function handleToggle() {
    setPendingToggle(true);
    const result = disabled ? await enableMemberAction(memberId) : await disableMemberAction(memberId);
    setPendingToggle(false);
    setToggleOpen(false);
    if (!result.ok) return toast.error(result.error);
    toast.success(disabled ? `${memberName} can sign in again.` : `${memberName} was disabled.`);
    router.refresh();
  }

  if (isOwner) {
    return <span className="text-xs text-muted-foreground">Admin</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        items={Object.fromEntries(ROLE_OPTIONS.map((o) => [o.value, o.label]))}
        value={role}
        onValueChange={(value) => value && value !== role && setRoleToConfirm(value)}
        disabled={pendingRole}
      >
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
      {locations && (
        <Select
          items={{ [ALL_LOCATIONS]: "All locations", ...Object.fromEntries(locations.map((l) => [l.id, l.name])) }}
          value={locationId ?? ALL_LOCATIONS}
          onValueChange={(value) => value && handleLocationChange(value)}
          disabled={pendingLocation}
        >
          <SelectTrigger size="sm" aria-label="Location">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_LOCATIONS}>All locations</SelectItem>
            {locations.map((location) => (
              <SelectItem key={location.id} value={location.id}>
                {location.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
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
      <Button variant="outline" size="sm" aria-label={`Remove ${memberName}`} onClick={() => setRemoveOpen(true)}>
        <Trash2 /> Remove
      </Button>
      <ConfirmDialog
        open={roleToConfirm !== null}
        onOpenChange={(open) => !open && setRoleToConfirm(null)}
        title={`Change ${memberName}'s role?`}
        description={`${memberName} will become ${roleToConfirm ? roleLabel(roleToConfirm) : ""} and get that role's access the next time they open a page.`}
        confirmLabel="Change role"
        destructive={false}
        pending={pendingRole}
        onConfirm={confirmRoleChange}
      />
      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title={`Remove ${memberName} from the team?`}
        description={`${memberName} will lose access for good and can no longer sign in to this business. Their past orders and history are kept. To block them only for now, use Disable instead.`}
        confirmLabel="Remove"
        pending={pendingRemove}
        onConfirm={confirmRemove}
      />
    </div>
  );
}
