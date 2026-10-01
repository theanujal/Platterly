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
import { BuildMenuStep } from "../../_components/build-menu-step";
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
  let step: WizardStepKey = WIZARD_STEPS[Math.max(index, 0)].key;
  // A draft saved before the 3-step flow may have no Venue Location yet; Event Details asks for it.
  if (!data.venueLocation) step = "details";

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
            venueLocation: data.venueLocation,
          },
        }}
      />
    );
  } else if (step === "menu") {
    const [menus, customSections, eventTypes, addOnRecords] = await Promise.all([
      listStorefrontMenus(organization.id, { eventTypeId: data.eventTypeId, menuType: data.menuPreference }),
      listCustomMenuSections(organization.id, data.menuPreference),
      listEventTypes(organization.id),
      listAddOns(organization.id),
    ]);
    const addOns = addOnRecords
      .filter((a) => a.isActive)
      .map((a) => ({ id: a.id, name: a.name, description: a.description, image: a.image, type: a.type, priceType: a.priceType, price: Number(a.price), included: a.includedInPackage }));
    // A saved choice that no longer exists (menu switched off) starts the customer at the menu list again.
    const savedChoice = data.menuChoice && (data.menuChoice.kind === "CUSTOM" || menus.some((m) => m.id === (data.menuChoice as { menuId: string }).menuId)) ? data.menuChoice : null;
    const kids = data.childBelow5Count + data.child5To10Count;
    content = (
      <BuildMenuStep
        tenantSlug={tenantSlug}
        draftId={draft.id}
        menus={menus}
        customSections={customSections}
        addOns={addOns}
        guests={data.guestCount}
        event={{
          date: new Date(data.eventDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
          eventType: eventTypes.find((e) => e.id === data.eventTypeId)?.name ?? "—",
          guests: kids > 0 ? `${data.guestCount} (${kids} kid${kids === 1 ? "" : "s"})` : String(data.guestCount),
          meals: data.eventMealTypes.map((m) => MEAL_LABEL[m] ?? m).join(", "),
          preference: data.menuPreference === "VEGETARIAN" ? "Vegetarian" : "Non-Vegetarian",
          location: data.venueLocation,
        }}
        initial={{ choice: savedChoice, itemIds: savedChoice ? (data.itemIds ?? []) : [], addOnIds: data.addOnIds ?? [] }}
      />
    );
  } else {
    if (!data.menuChoice || !data.itemIds?.length) notFound();
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
          venueLine: data.venueLocation,
        }}
      />
    );
  }

  return (
    <Shell
      organization={organization}
      width={step === "menu" ? "max-w-7xl" : undefined}
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
