"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User, Mail, Lock } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { IconInput } from "./icon-input";

interface SignUpFormProps {
  /** Where to land after a successful signup. Defaults to the normal
   * one-time onboarding wizard entry point. An invited teammate is sent
   * back to their invitation's accept page instead (see
   * `/invitations/[id]/accept`) — `provisionTenantForNewUser` skips
   * creating them a new Organization when a pending invitation matches
   * their email, so landing anywhere else would leave them without an
   * active org until they actually accept. */
  callbackURL?: string;
  /** Pre-filled and read-only when arriving from an invitation — the
   * account must be created under the exact email that was invited. */
  lockedEmail?: string;
}

// Chunk 4 Group 4.1 — creates the owner's account. On success, redirects
// straight into the one-time onboarding wizard at /kitchenlogin/onboarding
// (the Organization itself is already provisioned by this point, via
// `databaseHooks.user.create.after` — see `auto-provision.ts`). Business
// details are collected there, not on this form.
export function SignUpForm({ callbackURL, lockedEmail }: SignUpFormProps = {}) {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState(lockedEmail ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setPending(true);
    const name = [firstName, lastName].filter(Boolean).join(" ");
    const { error: signUpError } = await authClient.signUp.email({ name, firstName, lastName, email, password });
    setPending(false);
    if (signUpError) {
      setError(signUpError.message ?? "Could not create your account.");
      return;
    }
    router.push(callbackURL ?? "/kitchenlogin/onboarding");
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="signup-first-name">First name</Label>
          <IconInput
            id="signup-first-name"
            icon={User}
            autoComplete="given-name"
            required
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="signup-last-name">Last name</Label>
          <IconInput
            id="signup-last-name"
            icon={User}
            autoComplete="family-name"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-email">Email</Label>
        <IconInput
          id="signup-email"
          icon={Mail}
          type="email"
          autoComplete="email"
          required
          disabled={!!lockedEmail}
          readOnly={!!lockedEmail}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-password">Password</Label>
        <IconInput
          id="signup-password"
          icon={Lock}
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-confirm-password">Confirm password</Label>
        <IconInput
          id="signup-confirm-password"
          icon={Lock}
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
      </div>
      <div className="flex items-start gap-2">
        <input
          id="signup-terms"
          type="checkbox"
          required
          className="mt-0.5 size-4"
          checked={acceptedTerms}
          onChange={(event) => setAcceptedTerms(event.target.checked)}
        />
        <Label htmlFor="signup-terms" className="text-sm font-normal text-muted-foreground">
          I accept the Terms of Service and Privacy Policy
        </Label>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="h-11 rounded-full text-base font-semibold">
        {pending ? "Creating your account…" : "Create Platterly Account"}
      </Button>
    </form>
  );
}
