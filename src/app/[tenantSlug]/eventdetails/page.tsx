import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedTenantBySlug } from "@/modules/tenants/tenant";
import { listEventTypes } from "@/modules/events/event-type";
import { EventDetailsForm } from "./_components/event-details-form";

interface EventDetailsPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export async function generateMetadata({ params }: EventDetailsPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const organization = await getPublishedTenantBySlug(tenantSlug);
  if (!organization) return {};
  return { title: `Plan Your Event — ${organization.name}`, robots: { index: false, follow: false } };
}

// Chunk 11 Group 11.2 — the intake step of AJ's 2026-09-17 redesign: reached
// from Chunk 8's tenant-wide Public Menu Link, no login. Every visitor fills
// the same form; submitting always creates a brand-new Order+Event (see
// submitEventDetailsAction), never mapped to an existing one.
export default async function EventDetailsPage({ params }: EventDetailsPageProps) {
  const { tenantSlug } = await params;
  const organization = await getPublishedTenantBySlug(tenantSlug);
  if (!organization) notFound();

  const eventTypes = (await listEventTypes(organization.id)).filter((et) => et.isActive);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10 md:px-8">
      <header className="flex flex-col gap-1 text-center">
        <h1 className="text-2xl font-semibold">Plan Your Event</h1>
        <p className="text-sm text-muted-foreground">Tell us about your special occasion</p>
      </header>

      <EventDetailsForm tenantSlug={tenantSlug} eventTypes={eventTypes.map((et) => ({ id: et.id, name: et.name }))} />
    </main>
  );
}
