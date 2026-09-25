import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { getPublishedTenantBySlug } from "@/modules/tenants/tenant";
import { listEventTypes } from "@/modules/events/event-type";
import { listAddOns } from "@/modules/addons/addon";
import { listStorefrontMenus, listCustomMenuSections } from "@/modules/menus/menu";
import { getDraft, buildDraftQuote, StorefrontDraftError } from "@/modules/menu-approvals/storefront-draft";
import { WIZARD_STEPS, type WizardStepKey } from "@/modules/menu-approvals/storefront-draft-constants";
import { formatPhoneDisplay } from "@/lib/phone";
import { prisma } from "@/lib/db";
import { StorefrontHeader } from "../../_components/storefront-header";
import { WizardStepper } from "../../_components/wizard-stepper";
import { EventDetailsForm } from "../../_components/event-details-form";
import { MenuStep } from "../../_components/menu-step";
import { ItemsStep } from "../../_components/items-step";
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
        <div className="flex flex-col items-center gap-4 py-12 text-center" data-testid="confirmation">
          <CheckCircle2 className="size-14 text-success" />
          <h2 className="text-2xl font-semibold">Request Submitted Successfully!</h2>
          <p className="text-muted-foreground">Thank you for choosing {organization.name} for your special event.</p>
          {isCustom ? (
            <div className="max-w-md rounded-xl bg-muted p-4 text-sm">
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
            eventMealType: data.eventMealType,
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
    const addOns = (await listAddOns(organization.id))
      .filter((a) => a.isActive)
      .map((a) => ({ id: a.id, name: a.name, description: a.description, priceType: a.priceType, price: Number(a.price) }));
    content = (
      <ItemsStep
        tenantSlug={tenantSlug}
        draftId={draft.id}
        menuName={menuName}
        sections={sections}
        addOns={addOns}
        guests={data.guestCount}
        isCustomMenu={isCustom}
        initialItemIds={data.itemIds ?? []}
        initialAddOnIds={data.addOnIds ?? []}
      />
    );
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
    const items = await itemNames(organization.id, data);
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
          mealType: MEAL_LABEL[data.eventMealType] ?? data.eventMealType,
          menuPreferenceLabel: data.menuPreference === "VEGETARIAN" ? "Vegetarian" : "Non-Vegetarian",
          guests: data.guestCount,
          childBelow5Count: data.childBelow5Count,
          child5To10Count: data.child5To10Count,
          itemNames: items,
          venueLine: [data.venue.venueBuildingName, data.venue.venueHallName, data.venue.completeVenueAddress].filter(Boolean).join(", "),
        }}
      />
    );
  }

  return (
    <Shell organization={organization}>
      <WizardStepper tenantSlug={tenantSlug} draftId={draft.id} current={step} reachedStep={draft.currentStep} />
      {content}
    </Shell>
  );
}

async function itemNames(organizationId: string, data: { itemIds?: string[] }): Promise<string[]> {
  const rows = await prisma.menuItem.findMany({ where: { id: { in: data.itemIds ?? [] }, organizationId }, select: { id: true, name: true } });
  const byId = new Map(rows.map((r) => [r.id, r.name]));
  return (data.itemIds ?? []).map((id) => byId.get(id)).filter((n): n is string => !!n);
}

function Shell({ organization, children }: { organization: React.ComponentProps<typeof StorefrontHeader>["organization"]; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8 md:px-8">
      <StorefrontHeader organization={organization} compact />
      {children}
    </main>
  );
}
