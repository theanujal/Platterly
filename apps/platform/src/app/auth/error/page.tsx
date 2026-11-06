import Link from "next/link";
import { requireHost } from "@/modules/auth/host";

export default async function Page() {
  await requireHost("account");
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
