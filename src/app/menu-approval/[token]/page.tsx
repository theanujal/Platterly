import type { Metadata } from "next";
import { resolveApprovalLink } from "@/modules/menu-approvals/approval-link";
import { MEAL_TYPE_LABEL } from "@/modules/menu-approvals/approval-snapshot";
import { formatAmount } from "@/modules/orders/order-card";
import { CalendarDays, Check, MapPin, UtensilsCrossed, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PublicShell } from "@/components/public/public-shell";
import { FormCard } from "@/components/public/form-section";
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
      <PublicShell brand={{ name: "Platterly", logo: null }} width="max-w-xl">
        <div className="flex flex-col items-center gap-3 rounded-xl bg-card p-8 text-center ring-1 ring-foreground/10 md:p-12">
          <h1 className="text-2xl font-semibold">This link is no longer active</h1>
          <p className="text-sm text-muted-foreground">
            If you&apos;ve already responded, there&apos;s nothing more to do. Otherwise, please contact your caterer — they can send you a new one.
          </p>
        </div>
      </PublicShell>
    );
  }

  const { snapshot } = link;
  const sameDay = snapshot.eventStartDate === snapshot.eventEndDate;
  const dateText = sameDay ? formatDay(snapshot.eventStartDate) : `${formatDay(snapshot.eventStartDate)} – ${formatDay(snapshot.eventEndDate)}`;

  return (
    <PublicShell
      brand={{ name: link.organizationName, logo: link.organizationLogo }}
      title="Review & Approve Menu"
      subtitle={`Version ${link.versionNumber} · Please check your menu below, then approve it or ask us for changes.`}
      width="max-w-2xl"
    >
      <FormCard className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-base font-semibold">{snapshot.customerName}</p>
          {snapshot.eventTypeName && <Badge variant="outline">{snapshot.eventTypeName}</Badge>}
        </div>
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <Detail icon={<CalendarDays className="size-4" />} label="Date" value={dateText} />
          {snapshot.guests !== null && <Detail icon={<Users className="size-4" />} label="Guests" value={String(snapshot.guests)} />}
          {snapshot.venue && (
            <div className="sm:col-span-2">
              <Detail icon={<MapPin className="size-4" />} label="Venue" value={snapshot.venue} />
            </div>
          )}
        </dl>
      </FormCard>

      {snapshot.meals.length > 0 && (
        <div className="flex flex-col gap-4">
          {snapshot.meals.map((meal) => (
            <section key={`${meal.date}-${meal.mealType}`} className="flex flex-col gap-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <UtensilsCrossed className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[15px] font-semibold leading-tight">{MEAL_TYPE_LABEL[meal.mealType]}</h2>
                  {meal.menuName && <p className="text-sm text-muted-foreground">{meal.menuName}</p>}
                </div>
                <span className="text-sm text-muted-foreground">{formatDay(meal.date)}</span>
              </div>
              {meal.items.length > 0 && <ItemList names={meal.items.map((item) => item.name)} />}
            </section>
          ))}
        </div>
      )}

      {snapshot.selectedItems.length > 0 && (
        <section className="flex flex-col gap-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
          <h2 className="text-[15px] font-semibold">{snapshot.isCustomMenu ? "Your custom menu" : "Selected items"}</h2>
          <ItemList names={snapshot.selectedItems.map((item) => (item.isExtra ? `${item.name} (extra)` : item.name))} />
        </section>
      )}

      <div className="flex items-center justify-between rounded-lg bg-accent px-5 py-3 font-semibold text-accent-foreground">
        <span>Total</span>
        <span>{formatAmount(snapshot.total)}</span>
      </div>

      <ApprovalActions token={token} />
    </PublicShell>
  );
}

function Detail({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div>
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="font-medium">{value}</dd>
      </div>
    </div>
  );
}

function ItemList({ names }: { names: string[] }) {
  return (
    <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
      {names.map((name, index) => (
        <li key={index} className="flex items-start gap-2">
          <Check className="mt-0.5 size-4 shrink-0 text-success" />
          {name}
        </li>
      ))}
    </ul>
  );
}
