import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers as nextHeaders } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { SuperAdminLoginForm } from "./_components/login-form";

// Chunk 3 Group 3.1 — Super Admin login. Reserved path from Chunk 1 Group
// 1.4. A visitor with a live Super Admin session skips straight to the
// dashboard; everyone else sees the login form.
export const metadata: Metadata = {
  title: "Super Admin — Platterly",
  robots: { index: false, follow: false },
};

export default async function SuperAdminLoginPage() {
  const session = await auth.api.getSession({ headers: await nextHeaders() });
  if (session?.user.isSuperAdmin) {
    redirect("/super/dashboard");
  }

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold">Super Admin</h1>
          <p className="mt-2 text-sm text-neutral-500">
            Sign in to manage caterers, plans, and platform analytics.
          </p>
        </div>
        <SuperAdminLoginForm />
      </div>
    </main>
  );
}
