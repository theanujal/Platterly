import type { Metadata } from "next";
import { AuthLayout } from "../_components/auth-layout";
import { ForgotPasswordForm } from "../_components/forgot-password-form";

export const metadata: Metadata = {
  title: "Reset your password — Platterly",
  robots: { index: false, follow: false },
};

// A signed-out visitor asks for a 6-digit code by email, then chooses a new password (the same email-code flow as
// sign-up verification). Signed-in people change their password in Settings -> Change Password instead.
export default function ForgotPasswordPage() {
  return (
    <AuthLayout>
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
