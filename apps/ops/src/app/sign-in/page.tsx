import { redirect } from "next/navigation";
import { getStaff } from "@/lib/session";
import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in" };

export default async function SignInPage() {
  if (await getStaff()) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center bg-accent px-4">
      <div className="w-full max-w-sm rounded-xl bg-card p-6 shadow-[0_0_0_1px_rgba(17,24,39,0.1)]">
        <p className="text-xs font-bold uppercase tracking-wider text-accent-foreground">Platterly Ops</p>
        <h1 className="mt-2 text-2xl font-semibold">Sign in</h1>
        <p className="mb-5 mt-1 text-sm text-muted-foreground">Staff only. Accounts are created by an existing operator.</p>
        <SignInForm />
      </div>
    </main>
  );
}
