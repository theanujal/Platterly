import type { Metadata } from "next";
import { PublicShell } from "@/components/public/public-shell";
import { buildPayView } from "./pay-view";
import { PayClient } from "./_components/pay-client";

export const metadata: Metadata = {
  title: "Pay — Caterly",
  robots: { index: false, follow: false },
};

export default async function PayPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ back?: string }> }) {
  const { token } = await params;
  // Only our own approval page can be linked back to (no open redirect).
  const { back } = await searchParams;
  const backHref = back && /^\/menu-approval\/[A-Za-z0-9_-]+$/.test(back) ? back : null;
  const view = await buildPayView(token);

  // One neutral page for every failure (wrong, expired, other kitchen, or already paid in full).
  if (!view) {
    return (
      <PublicShell brand={{ name: "Platterly", logo: null }} width="max-w-xl">
        <div className="flex flex-col items-center gap-3 rounded-xl bg-card p-8 text-center ring-1 ring-foreground/10 md:p-12">
          <h1 className="text-2xl font-semibold">This link is no longer active</h1>
          <p className="text-sm text-muted-foreground">If you have already paid, there is nothing more to do. Otherwise, please contact your caterer and they can send you a new one.</p>
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell brand={{ name: view.businessName, logo: view.businessLogo }} width="max-w-lg">
      <PayClient {...view} backHref={backHref} />
    </PublicShell>
  );
}
