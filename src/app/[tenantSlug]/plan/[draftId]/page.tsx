import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock } from "lucide-react";
import { getPublishedTenantBySlug } from "@/modules/tenants/tenant";
import { listEventTypes } from "@/modules/events/event-type";
import { listAddOns } from "@/modules/addons/addon";
import { listStorefrontMenus, listCustomMenuSections } from "@/modules/menus/menu";
import { getDraft, buildDraftQuote, StorefrontDraftError } from "@/modules/menu-approvals/storefront-draft";
import { WIZARD_STEPS, isDraftExpired, type WizardStepKey } from "@/modules/menu-approvals/storefront-draft-constants";
import { formatPhoneDisplay } from "@/lib/phone";
import { PublicShell } from "@/components/public/public-shell";
import { WizardStepper } from "../../_components/wizard-stepper";
import { EventDetailsForm } from "../../_components/event-details-form";
import { MenuStep } from "../../_components/menu-step";
import { ItemsStep } from "../../_components/items-step";
import { AddOnsStep } from "../../_components/addons-step";
import { VenueStep } from "../../_components/venue-step";
import { ReviewStep } from "../../_components/review-step";

interface PlanPageProps {
  params: Promise<{ tenantSlug: string; draftId: string }>;
  searchParams: Promise<{ step?: string }>;
}

export async function generateMetadata({ params }: PlanPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const organization = await getPublishedTenantBySlug(tenantSlug);
  return { title: organization ? `Plan Your Event — ${organization.name}` : "Plan Your Event", robots: { index: false, follow: false } };
}

const MEAL_LABEL: Record<string, string> = { BREAKFAST: "Breakfast", LUNCH: "Lunch", HITEA: "Hi-Tea", DINNER: "Dinner", OTHER: "Other" };

// Chunk 12 — one route for the whole post-step-1 journey; `?step=` picks the
// screen, and a visitor can never jump past the furthest step they've
// unlocked (draft.currentStep). Everything is saved server-side per step, so
// a refresh, a back-button, or a WhatsApp "continue your booking" link all
// land exactly where they left off.
export default async function PlanPage({ params, searchParams }: PlanPageProps) {
  const { tenantSlug, draftId } = await params;
  const { step: stepParam } = await searchParams;
  const organization = await getPublishedTenantBySlug(tenantSlug);
  if (!organization) notFound();

  const draft = await getDraft(organization.id, draftId);
  if (!draft) notFound();
  const data = draft.data;

  if (draft.status === "COMPLETED") {
    const isCustom = data.menuChoice?.kind === "CUSTOM";
    return (
      <Shell organization={organization}>
        <div className="flex flex-col items-center gap-4 rounded-xl bg-card p-8 text-center ring-1 ring-foreground/10 md:p-12" data-testid="confirmation">
          <span className="flex size-16 items-center justify-center rounded-full bg-success/10 text-success">
            <CheckCircle2 className="size-9" />
          </span>
          <h2 className="text-2xl font-semibold">Request Submitted Successfully!</h2>
          <p className="text-muted-foreground">Thank you for choosing {organization.name} for your special event.</p>
          {isCustom ? (
            <div className="max-w-md rounded-xl bg-accent p-4 text-left text-sm">
              <p className="font-semibold">Thank you for submitting your custom menu selection.</p>
              <p className="mt-2 text-muted-foreground">
                Since this is a personalised menu, pricing is finalised based on your requirements and event details. One of our team members will contact you shortly to discuss the menu and confirm the price per plate.
              </p>
            </div>
          ) : (
            <p className="max-w-md text-sm text-muted-foreground">Our team will review your menu and follow up with you shortly over WhatsApp or email to finalise everything.</p>
          )}
        </div>
      </Shell>
    );
  }

  // Idle 30+ days (AJ, 2026-09-28): the draft itself is kept, but the link no
  // longer resumes — menu/pricing this stale shouldn't be silently honoured.
  if (isDraftExpired(draft.lastActivityAt)) {
    return (
      <Shell organization={organization}>
        <div className="flex flex-col items-center gap-4 rounded-xl bg-card p-8 text-center ring-1 ring-foreground/10 md:p-12" data-testid="expired">
          <span className="flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Clock className="size-9" />
          </span>
          <h2 className="text-2xl font-semibold">This link has expired</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            This booking request is no longer available online. Please contact {organization.name} directly to start a new one.
          </p>
        </div>
      </Shell>
    );
  }

  const requestedIndex = WIZARD_STEPS.findIndex((s) => s.key === stepParam);
  const index = Math.min(requestedIndex === -1 ? draft.currentStep - 1 : requestedIndex, draft.currentStep - 1);
  const step: WizardStepKey = WIZARD_STEPS[Math.max(index, 0)].key;

  let content: React.ReactNode;

  if (step === "details") {
    const eventTypes = (await listEventTypes(organization.id)).filter((et) => et.isActive);
    content = (
      <EventDetailsForm
        tenantSlug={tenantSlug}
        businessName={organization.name}
        eventTypes={eventTypes.map((et) => ({ id: et.id, name: et.name, minGuests: et.minGuests }))}
        draft={{
          id: draft.id,
          values: {
            name: draft.customer.name,
            email: draft.customer.email ?? "",
            phone: formatPhoneDisplay(draft.customer.phone),
            eventTypeId: data.eventTypeId,
            eventDate: data.eventDate,
            guestCount: String(data.guestCount),
            childBelow5Count: data.childBelow5Count ? String(data.childBelow5Count) : "",
            child5To10Count: data.child5To10Count ? String(data.child5To10Count) : "",
            eventMealTypes: data.eventMealTypes,
            menuPreference: data.menuPreference,
          },
        }}
      />
    );
  } else if (step === "menu") {
    const menus = await listStorefrontMenus(organization.id, { eventTypeId: data.eventTypeId, menuType: data.menuPreference });
    content = <MenuStep tenantSlug={tenantSlug} draftId={draft.id} menus={menus} selected={data.menuChoice} />;
  } else if (step === "items") {
    if (!data.menuChoice) notFound();
    const isCustom = data.menuChoice.kind === "CUSTOM";
    let sections;
    let menuName: string | null = null;
    if (data.menuChoice.kind === "MENU") {
      const menus = await listStorefrontMenus(organization.id, { eventTypeId: data.eventTypeId, menuType: data.menuPreference });
      const menu = menus.find((m) => m.id === (data.menuChoice as { menuId: string }).menuId);
      if (!menu) notFound();
      sections = menu.sections;
      menuName = menu.name;
    } else {
      sections = await listCustomMenuSections(organization.id, data.menuPreference);
    }
    content = (
      <ItemsStep
        tenantSlug={tenantSlug}
        draftId={draft.id}
        menuName={menuName}
        sections={sections}
        guests={data.guestCount}
        isCustomMenu={isCustom}
        initialItemIds={data.itemIds ?? []}
      />
    );
  } else if (step === "addons") {
    if (!data.itemIds?.length) notFound();
    const addOns = (await listAddOns(organization.id))
      .filter((a) => a.isActive)
      .map((a) => ({ id: a.id, name: a.name, description: a.description, image: a.image, type: a.type, priceType: a.priceType, price: Number(a.price), included: a.includedInPackage }));
    content = <AddOnsStep tenantSlug={tenantSlug} draftId={draft.id} addOns={addOns} guests={data.guestCount} initialAddOnIds={data.addOnIds ?? []} />;
  } else if (step === "venue") {
    content = <VenueStep tenantSlug={tenantSlug} draftId={draft.id} initial={data.venue} />;
  } else {
    if (!data.venue || !data.itemIds?.length) notFound();
    let quote;
    try {
      quote = await buildDraftQuote(organization.id, data);
    } catch (error) {
      if (error instanceof StorefrontDraftError) notFound();
      throw error;
    }
    const eventTypes = await listEventTypes(organization.id);
    // The same sections the Choose Items step shows, so dishes are listed under their own category.
    const reviewSections =
      data.menuChoice?.kind === "MENU"
        ? (await listStorefrontMenus(organization.id, { eventTypeId: data.eventTypeId, menuType: data.menuPreference })).find((m) => m.id === (data.menuChoice as { menuId: string }).menuId)?.sections ?? []
        : await listCustomMenuSections(organization.id, data.menuPreference);
    const extraIds = new Set(quote.extras.map((e) => e.id));
    const picked = new Set(data.itemIds ?? []);
    const extraCategories: Record<string, string> = {};
    const selectedSections = reviewSections
      .map((section) => {
        const inSection = section.items.filter((i) => picked.has(i.id));
        for (const item of inSection) if (extraIds.has(item.id) && !extraCategories[item.id]) extraCategories[item.id] = section.categoryName;
        return { categoryName: section.categoryName, items: inSection.filter((i) => !extraIds.has(i.id)).map((i) => i.name) };
      })
      .filter((section) => section.items.length > 0);
    content = (
      <ReviewStep
        tenantSlug={tenantSlug}
        draftId={draft.id}
        quote={quote}
        summary={{
          customerName: draft.customer.name,
          phone: formatPhoneDisplay(draft.customer.phone),
          eventTypeName: eventTypes.find((e) => e.id === data.eventTypeId)?.name ?? "—",
          eventDate: new Date(data.eventDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
          mealType: data.eventMealTypes.map((m) => MEAL_LABEL[m] ?? m).join(", "),
          menuPreferenceLabel: data.menuPreference === "VEGETARIAN" ? "Vegetarian" : "Non-Vegetarian",
          guests: data.guestCount,
          childBelow5Count: data.childBelow5Count,
          child5To10Count: data.child5To10Count,
          selectedSections,
          extraCategories,
          itemIds: data.itemIds ?? [],
          addOnIds: data.addOnIds ?? [],
          placedAt: new Date().toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).replace(/, (?=\d{1,2}:)/, " | "),
          venueLine: [data.venue.venueBuildingName, data.venue.completeVenueAddress].filter(Boolean).join(", "),
        }}
      />
    );
  }

  return (
    <Shell
      organization={organization}
      title={step === "details" ? "Plan Your Event" : undefined}
      subtitle={step === "details" ? "Check your details, then continue to your menu." : undefined}
    >
      <WizardStepper tenantSlug={tenantSlug} draftId={draft.id} current={step} reachedStep={draft.currentStep} />
      {content}
    </Shell>
  );
}

function Shell({
  organization,
  title,
  subtitle,
  width,
  children,
}: {
  organization: { name: string; logo: string | null };
  title?: string;
  subtitle?: string;
  width?: string;
  children: React.ReactNode;
}) {
  return (
    <PublicShell brand={{ name: organization.name, logo: organization.logo }} title={title} subtitle={subtitle} width={width}>
      {children}
    </PublicShell>
  );
}
