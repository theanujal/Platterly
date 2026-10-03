import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/app/kitchenlogin/_components/forgot-password-form";

// The same 6-digit email-code reset as the caterer sign-in, served on the ops host (/super is the only path it allows).
export const metadata: Metadata = {
  title: "Reset your password — Super Admin",
  robots: { index: false, follow: false },
};

export default function SuperAdminForgotPasswordPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <ForgotPasswordForm signInHref="/super" />
    </main>
  );
}
