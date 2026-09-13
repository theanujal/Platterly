"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Lock } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { IconInput } from "./icon-input";

interface SignInFormProps {
  /** Where to navigate after a successful sign-in. When omitted, refreshes
   * in place — /kitchenlogin's own server component then decides where an
   * authenticated session belongs (the normal case). The invitation accept
   * page passes its own URL so an existing account signing in from there
   * lands back on the invitation instead of the Dashboard. */
  callbackURL?: string;
}

// Chunk 4 Group 4.1 — returning caterer/kitchen admin sign-in. Unlike
// /super (login-only, admin-provisioned accounts), /kitchenlogin also
// offers sign-up — see AuthGate.
export function SignInForm({ callbackURL }: SignInFormProps = {}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const { error: signInError } = await authClient.signIn.email({ email, password });
    setPending(false);
    if (signInError) {
      setError(signInError.message ?? "Sign-in failed. Check your email and password.");
      return;
    }
    if (callbackURL) {
      router.push(callbackURL);
    } else {
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signin-email">Email</Label>
        <IconInput
          id="signin-email"
          icon={Mail}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signin-password">Password</Label>
        <IconInput
          id="signin-password"
          icon={Lock}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="h-11 rounded-full text-base font-semibold">
        {pending ? "Signing in…" : "Sign in to your account"}
      </Button>
    </form>
  );
}
