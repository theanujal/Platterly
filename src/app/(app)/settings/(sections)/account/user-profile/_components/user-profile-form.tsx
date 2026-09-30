"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User, Mail, ShieldCheck, IdCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconInput } from "@/components/ui/icon-input";
import { Label } from "@/components/ui/label";
import { useStopEditing } from "../../../../_components/editable-panel";
import { FormFooter, SettingsSection } from "../../../../_components/settings-ui";
import { updateUserProfileAction } from "../actions";

export interface UserProfileFormProps {
  initialFirstName: string;
  initialLastName: string;
  email: string;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export function UserProfileForm({ initialFirstName, initialLastName, email, role, createdAt, updatedAt }: UserProfileFormProps) {
  const router = useRouter();
  const stopEditing = useStopEditing();
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const formData = new FormData();
    formData.set("firstName", firstName);
    formData.set("lastName", lastName);
    const result = await updateUserProfileAction(formData);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
    stopEditing();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <SettingsSection icon={User} title="Personal Information">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="firstName">First Name</Label>
            <IconInput icon={User} id="firstName" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lastName">Last Name</Label>
            <IconInput icon={User} id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection icon={IdCard} title="Account Information">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email Address</Label>
            <IconInput icon={Mail} id="email" value={email} disabled readOnly />
            <p className="text-xs text-muted-foreground">Email address cannot be changed from here. Please contact support if needed.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="role">Account Role</Label>
            <IconInput icon={ShieldCheck} id="role" value={role} disabled readOnly />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="font-medium">Account Created</p>
            <p className="text-muted-foreground">{createdAt}</p>
          </div>
          <div>
            <p className="font-medium">Last Updated</p>
            <p className="text-muted-foreground">{updatedAt}</p>
          </div>
        </div>
      </SettingsSection>

      <FormFooter error={error}>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save Changes"}
        </Button>
        <Button type="button" variant="outline" onClick={stopEditing}>
          Cancel
        </Button>
      </FormFooter>
    </form>
  );
}
