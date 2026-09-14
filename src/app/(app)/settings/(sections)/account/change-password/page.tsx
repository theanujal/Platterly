import type { Metadata } from "next";
import { ChangePasswordForm } from "./_components/change-password-form";

export const metadata: Metadata = {
  title: "Change Password — Platterly",
  robots: { index: false, follow: false },
};

export default function ChangePasswordPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Change Password</h1>
        <p className="text-sm text-muted-foreground">Update the password you use to sign in.</p>
      </div>
      <ChangePasswordForm />
    </div>
  );
}
