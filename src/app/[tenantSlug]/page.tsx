import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedTenantBySlug } from "@/modules/tenants/tenant";
import { listEventTypes } from "@/modules/events/event-type";
import { canonicalUrl } from "@/lib/seo/canonical";
import { buildRestaurantJsonLd } from "@/lib/seo/structured-data";
import { EventDetailsForm } from "./_components/event-details-form";
import { PublicShell } from "@/components/public/public-shell";
import { StorefrontContact } from "./_components/storefront-contact";

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
    <PublicShell
      brand={{ name: organization.name, logo: organization.logo }}
      title="Plan Your Event"
      subtitle="Tell us a few details and we'll help you find the right menu."
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <StorefrontContact organization={organization} />

      <EventDetailsForm
        tenantSlug={tenantSlug}
        businessName={organization.name}
        eventTypes={eventTypes.map((et) => ({ id: et.id, name: et.name, minGuests: et.minGuests }))}
      />
    </PublicShell>
  );
}
