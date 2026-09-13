"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(false);
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
    setSuccess(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-lg flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="firstName">First name</Label>
          <Input id="firstName" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lastName">Last name</Label>
          <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" value={email} disabled readOnly />
        <p className="text-xs text-muted-foreground">Contact support to change your email address.</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="role">Account role</Label>
          <Input id="role" value={role} disabled readOnly className="capitalize" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
        <div>Created {createdAt}</div>
        <div>Updated {updatedAt}</div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {success && <p className="text-sm text-emerald-600">Saved.</p>}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
