import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedTenantBySlug } from "@/modules/tenants/tenant";
import { listEventTypes } from "@/modules/events/event-type";
import { canonicalUrl } from "@/lib/seo/canonical";
import { buildRestaurantJsonLd } from "@/lib/seo/structured-data";
import { EventDetailsForm } from "./_components/event-details-form";
import { StorefrontHeader } from "./_components/storefront-header";

interface StorefrontPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export async function generateMetadata({ params }: StorefrontPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const organization = await getPublishedTenantBySlug(tenantSlug);
  if (!organization) return {};

  const title = `Plan Your Event — ${organization.name}`;
  const description = organization.businessDescription?.trim() || `Plan your event with ${organization.name} on Platterly.`;
  const url = canonicalUrl(`/${organization.slug}`);
  const image = organization.logo ? canonicalUrl(organization.logo) : undefined;

  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      url,
      type: "website",
      images: image ? [{ url: image }] : undefined,
    },
  };
}

// Chunk 8 Group 8.3 + Chunk 11 Group 11.2 + Chunk 12 — the tenant-wide Public
// Menu Link opens straight into step 1 of the multi-step order flow (Event
// Details). Submitting it saves the visitor as a Lead and continues at
// /{slug}/plan/{draftId} (menu -> items -> venue -> review).
export default async function TenantStorefrontPage({ params }: StorefrontPageProps) {
  const { tenantSlug } = await params;
  const organization = await getPublishedTenantBySlug(tenantSlug);
  if (!organization) notFound();

  const eventTypes = (await listEventTypes(organization.id)).filter((et) => et.isActive);

  const url = canonicalUrl(`/${organization.slug}`);
  const jsonLd = buildRestaurantJsonLd({
    name: organization.name,
    description: organization.businessDescription,
    url,
    image: organization.logo ? canonicalUrl(organization.logo) : undefined,
    telephone: organization.contactPhone,
    address: {
      streetAddress: organization.addressLine1,
      addressLocality: organization.city,
      addressRegion: organization.state,
      postalCode: organization.postalCode,
      addressCountry: organization.country,
    },
    menuItems: [],
  });

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-10 md:px-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <StorefrontHeader organization={organization} />

      <div className="flex flex-col gap-1 text-center">
        <h2 className="text-xl font-semibold">Plan Your Event</h2>
        <p className="text-sm text-muted-foreground">Tell us about your special occasion</p>
      </div>

      <EventDetailsForm
        tenantSlug={tenantSlug}
        businessName={organization.name}
        eventTypes={eventTypes.map((et) => ({ id: et.id, name: et.name, minGuests: et.minGuests }))}
      />
    </main>
  );
}
