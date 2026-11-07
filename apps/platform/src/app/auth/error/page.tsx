import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { hostKind, requestHost } from "@/lib/routing/hosts";

export default async function Page() {
  const kind = hostKind(requestHost(await headers()));
  if (kind !== "account" && kind !== "store") notFound();
  return (
    <main style={{ maxWidth: 480, margin: "15vh auto", padding: "0 16px", fontFamily: "var(--font-sans), system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 24 }}>We could not sign you in</h1>
      <p>Something went wrong while signing in. Nothing was changed. Please try again.</p>
      <p>
        <Link href="/auth/start">Try again</Link>
      </p>
    </main>
  );
}
