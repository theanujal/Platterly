"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconInput } from "@/components/ui/icon-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { INVITATION_EXPIRY_HOURS } from "@/modules/team/invitation-config";
import { inviteMemberAction } from "../actions";
import { RoleIcon } from "./role-icons";
import { TeamNote } from "./team-note";

export interface InviteRoleOption {
  id: string;
  label: string;
  description: string;
  included: string[];
  excluded: string[];
}

/** The Invite Member tab: email + role, and a card that spells out exactly what the chosen role can do. */
export function InviteMemberForm({ roles, seatsFullMessage }: { roles: InviteRoleOption[]; seatsFullMessage: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState(roles.find((r) => r.id === "staff")?.id ?? roles[0].id);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const role = roles.find((r) => r.id === roleId) ?? roles[0];

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const result = await inviteMemberAction(email.trim(), role.id);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEmail("");
    router.push("/settings/team?tab=pending");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-email">Email Address</Label>
          <IconInput
            id="invite-email"
            icon={Mail}
            type="email"
            required
            placeholder="colleague@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <p className="text-sm text-muted-foreground">The invitation will be sent to this email address.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-role">Role</Label>
          <Select value={roleId} onValueChange={(value) => value && setRoleId(value)}>
            <SelectTrigger id="invite-role" className="w-full">
              <span className="flex items-center gap-2">
                <RoleIcon role={role.id} />
                {role.label}
              </span>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {roles.map((option) => (
                <SelectItem key={option.id} value={option.id} label={option.label}>
                  <RoleIcon role={option.id} />
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {(error ?? seatsFullMessage) && (
        <p role="alert" className="text-sm text-destructive">
          {error ?? seatsFullMessage}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" size="md" disabled={pending || !!seatsFullMessage}>
          <Send />
          {pending ? "Sending…" : "Send Invitation"}
        </Button>
      </div>

      <TeamNote>
        The invited user will need to create an account or sign in with the invited email address to accept the invitation.
        Invitations expire after {INVITATION_EXPIRY_HOURS} hours.
      </TeamNote>
      </div>

      <aside className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4 lg:sticky lg:top-4">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <RoleIcon role={role.id} className="size-4 text-muted-foreground" />
            {role.label}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{role.description}</p>
        </div>
        <div>
          <h4 className="text-sm font-semibold">Permissions included:</h4>
          <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
            {role.included.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        {role.excluded.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold">No access to:</h4>
            <p className="mt-1 text-sm text-muted-foreground">{role.excluded.join(", ")}</p>
          </div>
        )}
      </aside>
    </form>
  );
}
