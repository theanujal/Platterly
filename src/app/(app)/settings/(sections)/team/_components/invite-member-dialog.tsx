"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inviteMemberAction } from "../actions";

const ROLE_OPTIONS = [
  { value: "admin", label: "Team Admin" },
  { value: "manager", label: "Manager" },
  { value: "staff", label: "Staff" },
] as const;

/**
 * A per-invite custom permission bundle would need Better Auth's dynamic
 * access control (its own DB-backed custom-roles table) — out of scope for
 * this chunk. "Advanced" is a read-only preview of the selected preset's
 * actual grants instead, so an inviter can verify what they're sending
 * before they send it.
 */
const ROLE_GRANT_PREVIEWS: Record<(typeof ROLE_OPTIONS)[number]["value"], string[]> = {
  admin: [
    "Full access to customers, events, orders, menus, inventory, invoices, payments, reports, settings",
    "Can invite and manage other team members",
    "Cannot delete all tenant data (Danger Zone) — owner only",
  ],
  manager: [
    "Can view and create/edit customers, events, orders, menus, inventory",
    "Can view invoices and payments, create new ones",
    "Cannot delete records, cannot manage the team, cannot edit settings",
  ],
  staff: [
    "View-only across customers, events, orders, menus, inventory, reports",
    "No access to invoices, payments, team management, or settings",
  ],
};

export function InviteMemberDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof ROLE_OPTIONS)[number]["value"]>("staff");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const result = await inviteMemberAction(email, role);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    setEmail("");
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>Invite</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a team member</DialogTitle>
          <DialogDescription>They&apos;ll get an email with a link to join, valid for 7 days.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-role">Role</Label>
            <Select
              items={Object.fromEntries(ROLE_OPTIONS.map((o) => [o.value, o.label]))}
              value={role}
              onValueChange={(value) => setRole(value as typeof role)}
            >
              <SelectTrigger id="invite-role" className="w-full">
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
          </div>
          <button
            type="button"
            className="self-start text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? "Hide" : "Show"} what this role can do
          </button>
          {showAdvanced && (
            <ul className="flex flex-col gap-1 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
              {ROLE_GRANT_PREVIEWS[role].map((line) => (
                <li key={line}>• {line}</li>
              ))}
            </ul>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Sending…" : "Send invitation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
