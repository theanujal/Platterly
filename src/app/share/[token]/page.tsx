import type { Metadata } from "next";
import { CalendarDays, ChefHat, CircleCheck, Mail, MapPin, Phone, Users, UtensilsCrossed } from "lucide-react";
import { resolveShare, type ShareView } from "@/modules/orders/order-share";
import { PublicShell } from "@/components/public/public-shell";
import { FormCard } from "@/components/public/form-section";
import { formatApprovalDay } from "@/modules/menu-approvals/approval-view";

export const metadata: Metadata = {
  title: "Event details",
  robots: { index: false, follow: false },
};

// Read-only, no login, mobile first (AJ, 2026-10-12): what the customer shares with their family and team. No prices and
// no customer phone or email. Opens are not recorded.
export default async function SharedOrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const share = await resolveShare(token);

  // One neutral page for every failure (wrong, switched off, cancelled, menu not approved): nothing to probe.
  if (!share.ok) {
    return (
      <PublicShell brand={{ name: "Platterly", logo: null }} width="max-w-xl">
        <FormCard className="items-center gap-3 p-8 text-center">
          <h1 className="text-2xl font-semibold">This page is not available</h1>
          <p className="text-sm text-muted-foreground">The link may have been switched off. Please ask the person who shared it with you.</p>
        </FormCard>
      </PublicShell>
    );
  }

  if (share.ended) {
    return (
      <PublicShell brand={{ name: share.kitchen.name, logo: share.kitchen.logo }} width="max-w-xl">
        <FormCard className="items-center gap-3 p-8 text-center" >
          <h1 className="text-2xl font-semibold" data-testid="share-ended">This event has ended</h1>
          <p className="text-sm text-muted-foreground">Thank you for being part of it. This page is no longer shown.</p>
        </FormCard>
      </PublicShell>
    );
  }

  const { view } = share;
  return (
    <PublicShell brand={{ name: view.kitchen.name, logo: view.kitchen.logo }} title={view.eventType ?? "Event details"} subtitle={`Hosted by ${view.hostName}`} width="max-w-xl">
      <StatusCard view={view} />
      <EventCard view={view} />
      <MenuCard view={view} />
      <ContactCard view={view} />
    </PublicShell>
  );
}

function Tile({ icon: Icon, title }: { icon: typeof CalendarDays; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-5" />
      </span>
      <h2 className="text-[15px] font-semibold">{title}</h2>
    </div>
  );
}

function StatusCard({ view }: { view: ShareView }) {
  return (
    <div role="status" className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/10 p-4" data-testid="share-status">
      <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" />
      <div className="text-sm">
        <p className="font-semibold">{view.status.label}</p>
        <p className="text-muted-foreground">{view.status.detail}</p>
      </div>
    </div>
  );
}

function EventCard({ view }: { view: ShareView }) {
  return (
    <FormCard className="gap-4 md:p-5">
      <Tile icon={CalendarDays} title="Event" />
      <dl className="flex flex-col gap-3 text-sm">
        <div className="flex items-center gap-3">
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
          <dd className="font-medium">{view.dateText}</dd>
        </div>
        {view.guests !== null && (
          <div className="flex items-center gap-3">
            <Users className="size-4 shrink-0 text-muted-foreground" />
            <dd className="font-medium">{view.guests} guests</dd>
          </div>
        )}
        {view.venue && (
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <dd className="flex flex-col gap-1">
              <span className="font-medium">{view.venue}</span>
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(view.venue)}`} target="_blank" rel="noopener" className="text-primary underline-offset-4 hover:underline">
                Open in Maps
              </a>
            </dd>
          </div>
        )}
      </dl>
    </FormCard>
  );
}

function MenuCard({ view }: { view: ShareView }) {
  return (
    <FormCard className="gap-5 md:p-5">
      <Tile icon={UtensilsCrossed} title="Menu" />
      {view.meals.map((meal) => (
        <section key={meal.key} className="flex flex-col gap-3 border-t border-border pt-4 first-of-type:border-t-0 first-of-type:pt-0" data-testid="share-meal">
          <div>
            <h3 className="text-sm font-semibold">
              {meal.label} <span className="font-normal text-muted-foreground">· {formatApprovalDay(meal.date)}</span>
            </h3>
            {meal.menuName && <p className="text-sm text-muted-foreground">{meal.menuName}</p>}
          </div>
          {meal.groups.map((group) => (
            <div key={group.category} className="flex flex-col gap-1">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{group.category}</p>
              <ul className="flex flex-col gap-1 text-sm">
                {group.items.map((item) => (
                  <li key={item.name}>{item.name}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
      {view.extras.length > 0 && (
        <section className="flex flex-col gap-1 border-t border-border pt-4" data-testid="share-extras">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Live counters &amp; add-ons</p>
          <ul className="flex flex-col gap-1 text-sm">
            {view.extras.map((extra) => (
              <li key={extra.name}>{extra.name}</li>
            ))}
          </ul>
        </section>
      )}
    </FormCard>
  );
}

function ContactCard({ view }: { view: ShareView }) {
  const { phone, email, name } = view.kitchen;
  if (!phone && !email) return null;
  return (
    <FormCard className="gap-4 md:p-5" >
      <Tile icon={ChefHat} title={name} />
      <p className="text-sm text-muted-foreground">Questions about the food or the timing? Contact the kitchen.</p>
      <div className="flex flex-col gap-2 text-sm">
        {phone && (
          <a href={`tel:${phone}`} className="flex items-center gap-3 font-medium hover:underline" data-testid="share-kitchen-phone">
            <Phone className="size-4 text-muted-foreground" />
            {phone}
          </a>
        )}
        {email && (
          <a href={`mailto:${email}`} className="flex items-center gap-3 font-medium hover:underline">
            <Mail className="size-4 text-muted-foreground" />
            {email}
          </a>
        )}
      </div>
    </FormCard>
  );
}
