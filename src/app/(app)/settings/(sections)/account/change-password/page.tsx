import type { Metadata } from "next";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { ChangePasswordForm } from "./_components/change-password-form";

export const metadata: Metadata = {
  title: "Change Password — Platterly",
  robots: { index: false, follow: false },
};

export default function ChangePasswordPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Settings", href: "/settings" }, { label: "Change Password" }]} />
      <div>
        <h1 className="text-2xl font-semibold">Change Password</h1>
        <p className="text-sm text-muted-foreground">Update the password you use to sign in.</p>
      </div>
      <ChangePasswordForm />
    </div>
  );
}
