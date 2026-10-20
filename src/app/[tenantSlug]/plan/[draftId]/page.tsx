import type { Metadata, Viewport } from "next";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, Clock } from "lucide-react";
import { getPublishedTenantBySlug } from "@/modules/tenants/tenant";
import { listEventTypes } from "@/modules/events/event-type";
import { listAddOns } from "@/modules/addons/addon";
import { listStorefrontMenus, listCustomMenuSections, listMenus } from "@/modules/menus/menu";
import { getDraft, getDraftOrderNumber, buildDraftQuote, allMealsComplete, isMealComplete, draftDays, StorefrontDraftError } from "@/modules/menu-approvals/storefront-draft";
import { WIZARD_STEPS, isDraftExpired, type WizardStepKey } from "@/modules/menu-approvals/storefront-draft-constants";
import { formatPhoneDisplay } from "@/lib/phone";
import { PublicShell } from "@/components/public/public-shell";
import { WizardStepper } from "../../_components/wizard-stepper";
import { EventDetailsForm } from "../../_components/event-details-form";
import { BuildMenuStep } from "../../_components/build-menu-step";
import { ReviewStep } from "../../_components/review-step";
import { ScrollToTop } from "../../_components/scroll-to-top";
import { KitchenContactLinks } from "../../_components/kitchen-contact-links";
import { CopyButton } from "@/components/ui/copy-button";

interface PlanPageProps {
  params: Promise<{ tenantSlug: string; draftId: string }>;
  searchParams: Promise<{ step?: string; meal?: string }>;
}

// `cover` lets the bottom bar sit clear of a phone's home indicator (it pads by the safe-area inset).
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

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
/** "9 Nov 2026", or "9 Nov 2026 to 11 Nov 2026" for a date range. */
function eventDateText(data: { eventDate: string; eventEndDate?: string }, month: "short" | "long"): string {
  const format = (day: string) => new Date(day).toLocaleDateString("en-IN", { day: "numeric", month, year: "numeric", timeZone: "UTC" });
  const end = data.eventEndDate ?? data.eventDate;
  return end > data.eventDate ? `${format(data.eventDate)} to ${format(end)}` : format(data.eventDate);
}

export default async function PlanPage({ params, searchParams }: PlanPageProps) {
  const { tenantSlug, draftId } = await params;
  const { step: stepParam, meal: mealParam } = await searchParams;
  const organization = await getPublishedTenantBySlug(tenantSlug);
  if (!organization) notFound();

  const draft = await getDraft(organization.id, draftId);
  if (!draft) notFound();
  const data = draft.data;

  if (draft.status === "COMPLETED") {
    const orderNumber = await getDraftOrderNumber(organization.id, draft.orderId);
    const isCustom = Object.values(data.meals).some((meal) => meal?.menuChoice?.kind === "CUSTOM");
    return (
      <Shell organization={organization}>
        <div className="flex flex-col items-center gap-4 rounded-xl bg-card p-8 text-center ring-1 ring-foreground/10 md:p-12" data-testid="confirmation">
          <span className="flex size-16 items-center justify-center rounded-full bg-success/10 text-success">
            <CheckCircle2 className="size-9" />
          </span>
          <h2 className="text-2xl font-semibold">Request Submitted Successfully!</h2>
          <p className="text-muted-foreground">Thank you for choosing {organization.name} for your special event.</p>
          {orderNumber && (
            <div className="flex flex-col items-center gap-1 rounded-xl bg-accent px-6 py-4" data-testid="request-number">
              <span className="text-sm text-muted-foreground">Your request number</span>
              <span className="flex items-center gap-2 text-3xl font-bold text-primary">
                {orderNumber}
                <CopyButton value={orderNumber} label="Copy request number" iconOnly />
              </span>
              <span className="text-sm text-muted-foreground">Please mention it when you contact us.</span>
            </div>
          )}
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
          <p className="text-sm font-medium">Need to change something or have a question? Get in touch:</p>
          <KitchenContactLinks tenantSlug={tenantSlug} organization={organization} />
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
            This booking request is no longer available online. Please contact {organization.name} directly to start a new one:
          </p>
          <KitchenContactLinks tenantSlug={tenantSlug} organization={organization} />
        </div>
      </Shell>
    );
  }

  const requestedIndex = WIZARD_STEPS.findIndex((s) => s.key === stepParam);
  const index = Math.min(requestedIndex === -1 ? draft.currentStep - 1 : requestedIndex, draft.currentStep - 1);
  let step: WizardStepKey = WIZARD_STEPS[Math.max(index, 0)].key;
  // A draft saved before the 3-step flow may have no Venue Location yet; Event Details asks for it.
  if (!data.venueLocation) step = "details";

  // What the Edit details panel on Build Your Menu and Review needs (AJ, 2026-10-14).
  const buildEditDetails = (types: { id: string; name: string; minGuests: number | null; isActive: boolean }[]) => ({
    businessName: organization.name,
    eventTypes: types.filter((et) => et.isActive).map((et) => ({ id: et.id, name: et.name, minGuests: et.minGuests })),
    values: {
      name: draft.customer.name,
      email: draft.customer.email ?? "",
      phone: formatPhoneDisplay(draft.customer.phone),
      eventTypeId: data.eventTypeId,
      eventDate: data.eventDate,
      eventEndDate: data.eventEndDate ?? data.eventDate,
      guestCount: String(data.guestCount),
      childBelow5Count: data.childBelow5Count ? String(data.childBelow5Count) : "",
      child5To10Count: data.child5To10Count ? String(data.child5To10Count) : "",
      eventMealTypes: data.eventMealTypes,
      menuPreference: data.menuPreference,
      venueLocation: data.venueLocation,
    },
  });

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
            eventEndDate: data.eventEndDate ?? data.eventDate,
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
    const [menus, customSections, eventTypes, addOnRecords, allMenus] = await Promise.all([
      listStorefrontMenus(organization.id, { eventTypeId: data.eventTypeId, menuType: data.menuPreference }),
      listCustomMenuSections(organization.id, data.menuPreference),
      listEventTypes(organization.id),
      listAddOns(organization.id),
      listMenus(organization.id),
    ]);
    const menuNameById = new Map(allMenus.map((m) => [m.id, m.name]));
    const addOns = addOnRecords
      .filter((a) => a.isActive)
      .map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        image: a.image,
        type: a.type,
        priceType: a.priceType,
        price: Number(a.price),
        included: a.includedInPackage,
        allMenus: a.appliesToAllMenus,
        menuIds: a.menus.map((m) => m.menuId),
        menuNames: a.menus.map((m) => menuNameById.get(m.menuId)).filter((n): n is string => !!n),
      }));
    // Each meal builds its own menu (AJ, 2026-10-12). The requested meal, else the first one not finished, else the first.
    const mealTypes = data.eventMealTypes;
    const meal = mealTypes.find((m) => m === mealParam) ?? mealTypes.find((m) => !isMealComplete(data.meals[m])) ?? mealTypes[0];
    const selection = data.meals[meal] ?? {};
    // A saved choice that no longer exists (menu switched off) starts the customer at the menu list again.
    const savedChoice = selection.menuChoice && (selection.menuChoice.kind === "CUSTOM" || menus.some((m) => m.id === (selection.menuChoice as { menuId: string }).menuId)) ? selection.menuChoice : null;
    content = (
      <BuildMenuStep
        // A new event type or menu preference clears the saved picks, so it also starts the page afresh; other edits keep what is on screen.
        key={`${meal}:${data.eventTypeId}:${data.menuPreference}`}
        tenantSlug={tenantSlug}
        draftId={draft.id}
        meal={meal}
        mealTabs={mealTypes.map((m) => ({ meal: m, label: MEAL_LABEL[m] ?? m, done: isMealComplete(data.meals[m]) }))}
        menus={menus}
        customSections={customSections}
        addOns={addOns}
        guests={data.guestCount}
        days={draftDays(data).length}
        event={{
          date: eventDateText(data, "short"),
          eventType: eventTypes.find((e) => e.id === data.eventTypeId)?.name ?? "—",
          adults: data.guestCount,
          kidsBelow5: data.childBelow5Count,
          kids5To10: data.child5To10Count,
          meals: mealTypes.map((m) => MEAL_LABEL[m] ?? m).join(", "),
          preference: data.menuPreference === "VEGETARIAN" ? "Vegetarian" : "Non-Vegetarian",
          location: data.venueLocation,
        }}
        editDetails={buildEditDetails(eventTypes)}
        initial={{ choice: savedChoice, itemIds: savedChoice ? (selection.itemIds ?? []) : [], addOnIds: selection.addOnIds ?? [] }}
      />
    );
  } else {
    // Every meal needs its menu and dishes before the review: send the visitor to the first one that is not done.
    if (!allMealsComplete(data)) {
      const next = data.eventMealTypes.find((m) => !isMealComplete(data.meals[m])) ?? data.eventMealTypes[0];
      redirect(`/${tenantSlug}/plan/${draftId}?step=menu&meal=${next}`);
    }
    let quote;
    try {
      quote = await buildDraftQuote(organization.id, data);
    } catch (error) {
      if (error instanceof StorefrontDraftError) notFound();
      throw error;
    }
    const [eventTypes, menusForEvent, customSections] = await Promise.all([
      listEventTypes(organization.id),
      listStorefrontMenus(organization.id, { eventTypeId: data.eventTypeId, menuType: data.menuPreference }),
      listCustomMenuSections(organization.id, data.menuPreference),
    ]);
    // The same sections the Build Your Menu step shows, so each meal's dishes are listed under their own category.
    const meals = quote.perMeal.map((mealQuote) => {
      const selection = data.meals[mealQuote.mealType]!;
      const sections = selection.menuChoice?.kind === "MENU" ? (menusForEvent.find((m) => m.id === (selection.menuChoice as { menuId: string }).menuId)?.sections ?? []) : customSections;
      const extraIds = new Set(mealQuote.extras.map((e) => e.id));
      const picked = new Set(selection.itemIds ?? []);
      const extraCategories: Record<string, string> = {};
      const selectedSections = sections
        .map((section) => {
          const inSection = section.items.filter((i) => picked.has(i.id));
          for (const item of inSection) if (extraIds.has(item.id) && !extraCategories[item.id]) extraCategories[item.id] = section.categoryName;
          return { categoryName: section.categoryName, items: inSection.filter((i) => !extraIds.has(i.id)).map((i) => i.name) };
        })
        .filter((section) => section.items.length > 0);
      return { mealType: mealQuote.mealType, label: MEAL_LABEL[mealQuote.mealType] ?? mealQuote.mealType, menuName: mealQuote.isCustomMenu ? "Custom Menu" : mealQuote.menuName, selectedSections, extraCategories, itemIds: selection.itemIds ?? [], addOnIds: selection.addOnIds ?? [] };
    });
    content = (
      <ReviewStep
        tenantSlug={tenantSlug}
        draftId={draft.id}
        quote={quote}
        editDetails={buildEditDetails(eventTypes)}
        summary={{
          customerName: draft.customer.name,
          phone: formatPhoneDisplay(draft.customer.phone),
          eventTypeName: eventTypes.find((e) => e.id === data.eventTypeId)?.name ?? "—",
          eventDate: eventDateText(data, "long"),
          mealType: data.eventMealTypes.map((m) => MEAL_LABEL[m] ?? m).join(", "),
          menuPreferenceLabel: data.menuPreference === "VEGETARIAN" ? "Vegetarian" : "Non-Vegetarian",
          guests: data.guestCount,
          childBelow5Count: data.childBelow5Count,
          child5To10Count: data.child5To10Count,
          meals,
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
      <ScrollToTop key={step} />
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
