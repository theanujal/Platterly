"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MailCheck } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { InputOTP } from "@/components/ui/input-otp";
import { maskEmail } from "@/lib/auth/mask-email";

const RESEND_COOLDOWN_SECONDS = 60;

export function VerifyEmailForm({ email, next }: { email: string; next: string }) {
  const router = useRouter();
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  async function handleVerify() {
    setError(null);
    setPending(true);
    const { error: verifyError } = await authClient.emailOtp.verifyEmail({ email, otp });
    setPending(false);
    if (verifyError) {
      setError(verifyError.message ?? "That code didn't work. Check it and try again.");
      return;
    }
    router.push(next);
  }

  async function handleResend() {
    setResending(true);
    setError(null);
    const { error: resendError } = await authClient.emailOtp.sendVerificationOtp({ email, type: "email-verification" });
    setResending(false);
    if (resendError) {
      setError(resendError.message ?? "Could not resend the code. Try again in a moment.");
      return;
    }
    setOtp("");
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
  }

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <MailCheck className="size-8" />
      </span>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-xl font-semibold">Verify your email</h1>
        <p className="text-sm text-muted-foreground">
          We&apos;ve sent a 6-digit code to <span className="font-medium text-foreground">{maskEmail(email)}</span>
        </p>
      </div>

      <div className="flex flex-col items-center gap-2">
        <Label htmlFor="verify-otp" className="text-sm font-medium">Enter verification code</Label>
        <InputOTP id="verify-otp" value={otp} onChange={setOtp} maxLength={6} disabled={pending} autoFocus />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button
        type="button"
        disabled={otp.length !== 6 || pending}
        onClick={handleVerify}
        className="w-full text-base font-semibold"
      >
        {pending ? "Verifying…" : "Verify Email"}
      </Button>

      <p className="text-sm text-muted-foreground">
        Didn&apos;t receive the code?{" "}
        {resendCooldown > 0 ? (
          <span>Resend code in {resendCooldown}s</span>
        ) : (
          <button type="button" onClick={handleResend} disabled={resending} className="font-medium text-primary hover:underline">
            {resending ? "Sending…" : "Resend code"}
          </button>
        )}
      </p>
    </div>
  );
}
