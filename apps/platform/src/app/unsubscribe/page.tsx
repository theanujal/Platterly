import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { hostKind, requestHost } from "@/lib/routing/hosts";
import { verifyUnsubscribe } from "@/modules/newsletter/unsubscribe";

export const dynamic = "force-dynamic";
export const metadata = { title: "Unsubscribe", robots: { index: false } };

// The page a newsletter's Unsubscribe link opens. No sign-in. It only asks "Unsubscribe?"; the button POSTs to the API, so a mail scanner opening the link changes nothing.
export default async function Page({ searchParams }: { searchParams: Promise<{ u?: string; t?: string; done?: string }> }) {
  if (hostKind(requestHost(await headers())) !== "account") notFound();
  const { u = "", t = "", done } = await searchParams;
  const valid = verifyUnsubscribe(process.env.AUTH_SECRET ?? "", u, t);
  return (
    <main style={{ maxWidth: 480, margin: "72px auto", padding: "0 16px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22 }}>Unsubscribe from the newsletter</h1>
      {done === "1" ? (
        <p role="status">You have been unsubscribed from the newsletter. You will still get messages about your account.</p>
      ) : valid ? (
        <form method="post" action="/api/newsletter/unsubscribe">
          <p>You will stop getting the Platterly newsletter. You will still get messages about your account.</p>
          <input type="hidden" name="u" value={u} />
          <input type="hidden" name="t" value={t} />
          <input type="hidden" name="from" value="page" />
          <button type="submit" style={{ padding: "10px 18px", fontSize: 15 }}>Unsubscribe</button>
        </form>
      ) : (
        <p role="alert">This link is not valid. You can switch the newsletter off any time under Notifications in your Platterly Account.</p>
      )}
    </main>
  );
}
