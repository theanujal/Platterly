import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

// Rendered when `forbidden()` is called (require-session.ts): signed in, but this account's
// role can't open the page, or the account is disabled.
export default function Forbidden() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold text-gray-900">You don&apos;t have access to this page</h1>
      <p className="max-w-sm text-sm text-gray-600">
        Your role can&apos;t open it, or your account has been disabled. Ask the owner of your kitchen if you need access.
      </p>
      <Link href="/dashboard" className={buttonVariants()}>
        Back to Dashboard
      </Link>
    </main>
  );
}
