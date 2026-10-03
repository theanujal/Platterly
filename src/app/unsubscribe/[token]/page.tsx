import type { Metadata } from "next";
import { PublicShell } from "@/components/public/public-shell";
import { customerIdFromUnsubscribeToken } from "@/lib/notifications/unsubscribe";
import { getOptOutView } from "@/modules/notifications/opt-out";
import { prisma } from "@/lib/db";
import { OptOutButton } from "./opt-out-button";

export const metadata: Metadata = {
  title: "Email preferences",
  robots: { index: false, follow: false },
};

// The link at the foot of customer emails (AJ, 2026-10-04). No sign-in: the signed token in the address is the credential.
export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const customerId = customerIdFromUnsubscribeToken(token);
  const view = customerId ? await getOptOutView(customerId) : null;

  if (!customerId || !view) {
    return (
      <PublicShell brand={{ name: "Platterly", logo: null }} width="max-w-xl">
        <div className="flex flex-col items-center gap-3 rounded-xl bg-card p-8 text-center ring-1 ring-foreground/10 md:p-12">
          <h1 className="text-2xl font-semibold">This link is not valid</h1>
          <p className="text-sm text-muted-foreground">It may have been copied incorrectly. Use the link in the latest email you received.</p>
        </div>
      </PublicShell>
    );
  }

  const org = await prisma.customer.findUniqueOrThrow({ where: { id: customerId }, select: { organization: { select: { name: true, logo: true } } } });

  return (
    <PublicShell brand={{ name: org.organization.name, logo: org.organization.logo }} width="max-w-xl">
      <div className="flex flex-col items-center gap-4 rounded-xl bg-card p-8 text-center ring-1 ring-foreground/10 md:p-12">
        <h1 className="text-2xl font-semibold">{view.optedOut ? "You are unsubscribed" : "Promotional emails"}</h1>
        <p className="text-sm text-muted-foreground">
          {view.optedOut
            ? `${view.kitchenName} will not send you promotional messages. You will still get messages about your own orders, such as quotations, invoices and event reminders.`
            : `Stop promotional messages from ${view.kitchenName}? You will still get messages about your own orders, such as quotations, invoices and event reminders.`}
        </p>
        <OptOutButton token={token} optedOut={view.optedOut} />
      </div>
    </PublicShell>
  );
}
