import type { Metadata } from "next";
import { resolveApprovalLink } from "@/modules/menu-approvals/approval-link";
import { MEAL_TYPE_LABEL } from "@/modules/menu-approvals/approval-snapshot";
import { formatAmount } from "@/modules/orders/order-card";
import { Card, CardContent } from "@/components/ui/card";
import { ApprovalActions } from "./_components/approval-actions";

export const metadata: Metadata = {
  title: "Review & Approve Menu — Platterly",
  robots: { index: false, follow: false },
};

// Dates in the snapshot are UTC-midnight ISO days — format them in UTC so they never shift a day.
function formatDay(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export default async function MenuApprovalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await resolveApprovalLink(token);

  // One neutral page for every failure (wrong, expired, revoked, superseded or already answered) — no way to tell them apart.
  if (!link.ok) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <div className="flex max-w-sm flex-col items-center gap-2 text-center">
          <h1 className="text-xl font-semibold">This link is no longer active</h1>
          <p className="text-sm text-muted-foreground">
            If you&apos;ve already responded, there&apos;s nothing more to do. Otherwise, please contact your caterer — they can send you a new one.
          </p>
        </div>
      </main>
    );
  }

  const { snapshot } = link;
  const sameDay = snapshot.eventStartDate === snapshot.eventEndDate;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10 md:px-8">
      <header className="flex flex-col items-center gap-1 text-center">
        <p className="text-sm text-muted-foreground">{link.organizationName}</p>
        <h1 className="text-xl font-semibold">Review &amp; Approve Menu</h1>
        <p className="text-xs text-muted-foreground">Version {link.versionNumber}</p>
      </header>

      <Card>
        <CardContent className="flex flex-col gap-1 text-sm">
          <p className="text-base font-semibold">{snapshot.customerName}</p>
          {snapshot.eventTypeName && <p className="text-muted-foreground">{snapshot.eventTypeName}</p>}
          <p>
            <span className="text-muted-foreground">Date: </span>
            {sameDay ? formatDay(snapshot.eventStartDate) : `${formatDay(snapshot.eventStartDate)} – ${formatDay(snapshot.eventEndDate)}`}
          </p>
          {snapshot.guests !== null && (
            <p>
              <span className="text-muted-foreground">Guests: </span>
              {snapshot.guests}
            </p>
          )}
          {snapshot.venue && (
            <p>
              <span className="text-muted-foreground">Venue: </span>
              {snapshot.venue}
            </p>
          )}
        </CardContent>
      </Card>

      {snapshot.meals.length > 0 && (
        <div className="flex flex-col gap-3">
          {snapshot.meals.map((meal) => (
            <div key={`${meal.date}-${meal.mealType}`} className="flex flex-col gap-1 rounded-lg border border-border p-4 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">{MEAL_TYPE_LABEL[meal.mealType]}</span>
                <span className="text-xs text-muted-foreground">{formatDay(meal.date)}</span>
              </div>
              {meal.menuName && <span className="text-muted-foreground">{meal.menuName}</span>}
              {meal.items.length > 0 && (
                <ul className="mt-1 flex flex-col gap-0.5">
                  {meal.items.map((item, index) => (
                    <li key={index}>{item.name}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {snapshot.selectedItems.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-4 text-sm">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{snapshot.isCustomMenu ? "Your custom menu" : "Selected items"}</h2>
          <ul className="flex flex-col gap-0.5">
            {snapshot.selectedItems.map((item, index) => (
              <li key={index}>
                {item.name}
                {item.isExtra && <span className="text-muted-foreground"> (extra)</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-4 text-sm font-semibold">
        <span>Total</span>
        <span>{formatAmount(snapshot.total)}</span>
      </div>

      <ApprovalActions token={token} />
    </main>
  );
}
