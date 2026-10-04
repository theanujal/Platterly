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
import { INVITABLE_ROLE_DEFINITIONS } from "@/lib/auth/role-metadata";
import { updateMemberRoleAction, disableMemberAction, enableMemberAction, setMemberLocationAction } from "../actions";

const ROLE_OPTIONS = INVITABLE_ROLE_DEFINITIONS.map((r) => ({ value: r.id, label: r.label }));

interface MemberRowActionsProps {
  memberId: string;
  role: string;
  disabled: boolean;
  /** Chunk 23: the member's location, and the locations to pick from. Null locations = the feature is off. */
  locationId: string | null;
  locations: { id: string; name: string }[] | null;
}

const ALL_LOCATIONS = "ALL";

export function MemberRowActions({ memberId, role, disabled, locationId, locations }: MemberRowActionsProps) {
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

  const [pendingLocation, setPendingLocation] = useState(false);
  async function handleLocationChange(value: string) {
    setPendingLocation(true);
    await setMemberLocationAction(memberId, value === ALL_LOCATIONS ? null : value);
    setPendingLocation(false);
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
      <Select
        items={Object.fromEntries(ROLE_OPTIONS.map((o) => [o.value, o.label]))}
        value={role}
        onValueChange={(value) => value && handleRoleChange(value)}
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
    </div>
  );
}
