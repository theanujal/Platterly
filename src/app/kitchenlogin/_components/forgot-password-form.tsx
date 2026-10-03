"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound, Lock, Mail, ShieldCheck } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { InputOTP } from "@/components/ui/input-otp";
import { maskEmail } from "@/lib/auth/mask-email";
import { IconInput, PasswordInput } from "./icon-input";

const RESEND_COOLDOWN_SECONDS = 60;
const MIN_PASSWORD_LENGTH = 8;

type Step = "email" | "reset" | "done";

/** `signInHref` is where "Back to sign in" goes: the caterer sign-in (/) or, on the ops host, /super. */
export function ForgotPasswordForm({ signInHref = "/" }: { signInHref?: string } = {}) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((s) => s - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function sendCode() {
    setError(null);
    setPending(true);
    const { error: sendError } = await authClient.emailOtp.sendVerificationOtp({ email: email.trim(), type: "forget-password" });
    setPending(false);
    if (sendError) {
      setError(sendError.message ?? "We couldn't send the code. Try again in a moment.");
      return false;
    }
    setCooldown(RESEND_COOLDOWN_SECONDS);
    return true;
  }

  async function handleEmail(event: React.FormEvent) {
    event.preventDefault();
    if (await sendCode()) setStep("reset");
  }

  async function handleResend() {
    setOtp("");
    await sendCode();
  }

  async function handleReset(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) return setError(`Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`);
    if (password !== confirm) return setError("The two passwords don't match.");
    setPending(true);
    const { error: resetError } = await authClient.emailOtp.resetPassword({ email: email.trim(), otp, password });
    setPending(false);
    if (resetError) {
      setError(resetError.message ?? "That code didn't work. Check it and try again.");
      return;
    }
    setStep("done");
  }

  if (step === "done") {
    return (
      <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-success/10 text-success">
          <ShieldCheck className="size-8" />
        </span>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-xl font-semibold">Password changed</h1>
          <p className="text-sm text-muted-foreground">You can now sign in with your new password.</p>
        </div>
        <Button render={<Link href={signInHref} />} nativeButton={false} className="w-full text-base font-semibold">
          Back to sign in
        </Button>
      </div>
    );
  }

  if (step === "email") {
    return (
      <form onSubmit={handleEmail} className="flex w-full max-w-sm flex-col gap-5">
        <div className="flex flex-col gap-1.5 text-center">
          <h1 className="text-xl font-semibold">Forgot your password?</h1>
          <p className="text-sm text-muted-foreground">Enter your email and we&apos;ll send you a 6-digit code to choose a new one.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="forgot-email">Email</Label>
          <IconInput id="forgot-email" icon={Mail} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={pending} className="text-base font-semibold">
          {pending ? "Sending…" : "Send code"}
        </Button>
        <Link href={signInHref} className="text-center text-sm font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      </form>
    );
  }

  return (
    <form onSubmit={handleReset} className="flex w-full max-w-sm flex-col gap-5">
      <div className="flex flex-col gap-1.5 text-center">
        <h1 className="text-xl font-semibold">Choose a new password</h1>
        <p className="text-sm text-muted-foreground">
          If an account exists for <span className="font-medium text-foreground">{maskEmail(email.trim())}</span>, we&apos;ve sent it a 6-digit code.
        </p>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Label htmlFor="reset-otp" className="text-sm font-medium">
          Enter the code
        </Label>
        <InputOTP id="reset-otp" value={otp} onChange={setOtp} maxLength={6} disabled={pending} autoFocus />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reset-password">New password</Label>
        <PasswordInput id="reset-password" icon={Lock} autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reset-confirm">Confirm new password</Label>
        <PasswordInput id="reset-confirm" icon={KeyRound} autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={otp.length !== 6 || pending} className="text-base font-semibold">
        {pending ? "Saving…" : "Change password"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Didn&apos;t receive the code?{" "}
        {cooldown > 0 ? (
          <span>Resend code in {cooldown}s</span>
        ) : (
          <button type="button" onClick={handleResend} disabled={pending} className="font-medium text-primary hover:underline">
            Resend code
          </button>
        )}
      </p>
    </form>
  );
}
