"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { FormFooter } from "../../../../_components/settings-ui";

// Chunk 5 Group 5.1 — thin wrapper on better-auth's own changePassword
// endpoint (already available via emailAndPassword: {enabled:true} in
// auth.ts) — no new backend logic. One of the few places in this codebase
// calling the client SDK directly rather than a server action, matching how
// better-auth's own password APIs are typically consumed.
export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  function reset() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
    setSuccess(false);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setPending(true);
    const { error: changeError } = await authClient.changePassword({ currentPassword, newPassword });
    setPending(false);
    if (changeError) {
      setError(changeError.message ?? "Could not change your password.");
      return;
    }
    setSuccess(true);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="currentPassword">Current Password</Label>
        <PasswordInput
          icon={Lock}
          id="currentPassword"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="newPassword">New Password</Label>
        <PasswordInput
          icon={Lock}
          id="newPassword"
          autoComplete="new-password"
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmPassword">Confirm New Password</Label>
        <PasswordInput
          icon={Lock}
          id="confirmPassword"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </div>
      <FormFooter error={error} success={success ? "Password changed." : null}>
        <Button type="submit" disabled={pending}>
          {pending ? "Changing…" : "Change Password"}
        </Button>
        <Button type="button" variant="outline" onClick={reset}>
          Cancel
        </Button>
      </FormFooter>
    </form>
  );
}
