"use client";

import { createElement, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, Info, MapPin, PenSquare, Tag, User, UtensilsCrossed, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconInput } from "@/components/ui/icon-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MenuPlanningSection, MEAL_TYPES, MEAL_ICON, type MealSelection, type MenuOption, type MealTypeValue } from "@/components/catalog/menu-planning-section";
import { CustomerCombobox, type SelectedCustomer } from "@/components/customers/customer-combobox";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { cn } from "cn";
import { FormSection, SummaryCard, SummaryRow } from "../../orders/_components/order-form-parts";
import { TONE_SURFACE, TONE_TEXT } from "../../orders/_components/order-display";
import { getOrderCountsByDayAction, searchCustomersAction, createCustomerForOrderAction } from "../../orders/actions";
import { getMenuForQuotationPickerAction, type ActionResult } from "../actions";

/**
 * Item-picker parity with Order (2026-09-28) — this form mirrors
 * order-form.tsx's layout, state machinery and Menu Planning flow closely
 * (same guest counts, veg/non-veg preference, Single/Multi grouping, the
 * shared Event Dates sidebar + food-item-selection drawer, 2026-09-29).
 * Deliberately different from Order: no structured venue/delivery block
 * (Quotation keeps only its existing plain Venue/Event Address fields), no
 * Payment Details card (Quotation has no payment concept — status lives in
 * QuotationStatusActions on the detail page), and the softer
 * <2-days-before-event rule this form already had (kept as-is, not replaced
 * with Order's harder no-backdating rule).
 */

// Mirrors actions.ts's own MIN_DAYS_BEFORE_EVENT/daysUntil/assertEventDateAllowed
// exactly — applied consistently "wherever event dates are entered" (AJ,
// 2026-09-19), same rule as Create Order's own. A Quotation's event date is
// optional, so this is a no-op until one is actually set.
const MIN_DAYS_BEFORE_EVENT = 2;

function daysUntilPreview(iso: string): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const eventDate = new Date(y, m - 1, d);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((eventDate.getTime() - startOfToday.getTime()) / 86_400_000);
}

/** "Starts in" wording for the event-date chip and the summary — same tones as the Orders card's countdown. */
function startsInPreview(days: number | null): { caption: string; label: string; tone: "orange" | "yellow" | "success" } | null {
  if (days === null || days < 0) return null;
  if (days === 0) return { caption: "Event", label: "Today", tone: "orange" };
  return { caption: "Starts in", label: `${days} ${days === 1 ? "day" : "days"}`, tone: days <= 2 ? "yellow" : "success" };
}

// Reuses Menu's own ChildPricingType enum (PERCENTAGE | FIXED) — "Per Plate"
// is this form's label for FIXED, matching Order's own wording.
const CHILD_PRICING_TYPE_OPTIONS = [
  { value: "FIXED", label: "Per Plate" },
  { value: "PERCENTAGE", label: "Percentage" },
] as const;

export interface QuotationFormValues {
  customerId: string;
  eventTypeId: string;
  /** "VEGETARIAN" | "NON_VEGETARIAN" | "" (no preference), as on Order's own form. */
  menuPreference: string;
  /** SINGLE renders Meal Planning as one continuous event; MULTI groups the same per-day data into "Event 1/Event 2…" blocks. */
  orderKind: string;
  eventStartDate: string;
  eventEndDate: string;
  venue: string;
  eventAddress: string;
  adultCount: string;
  childBelow5Count: string;
  child5To10Count: string;
  totalParticipants: string;
  /** Quotation-level, all Order Kinds — Standard reuses the first assigned meal's own Menu's child rates; Individual overrides with the two rates+types below. */
  pricingMethod: string;
  individualChildBelow5Rate: string;
  individualChildBelow5PricingType: string;
  individualChild5To10Rate: string;
  individualChild5To10PricingType: string;
  individualPricingEnabled: boolean;
  validUntil: string;
  terms: string;
  notes: string;
  discount: string;
  taxes: string;
  additionalCharges: string;
  deliveryCharges: string;
  mealPlanEntries: MealSelection[];
}

export const EMPTY_QUOTATION_VALUES: QuotationFormValues = {
  customerId: "",
  eventTypeId: "",
  menuPreference: "",
  orderKind: "SINGLE",
  eventStartDate: "",
  eventEndDate: "",
  venue: "",
  eventAddress: "",
  adultCount: "",
  childBelow5Count: "",
  child5To10Count: "",
  totalParticipants: "",
  pricingMethod: "STANDARD",
  individualChildBelow5Rate: "",
  individualChildBelow5PricingType: "FIXED",
  individualChild5To10Rate: "",
  individualChild5To10PricingType: "FIXED",
  individualPricingEnabled: false,
  validUntil: "",
  terms: "",
  notes: "",
  discount: "0",
  taxes: "0",
  additionalCharges: "0",
  deliveryCharges: "0",
  mealPlanEntries: [],
};

/**
 * Formats a Date's own local calendar date as "YYYY-MM-DD" — deliberately
 * NOT `.toISOString().slice(0, 10)`, which converts through UTC first and
 * silently shifts the date backward a full day in any positive-UTC-offset
 * timezone (IST included — this app's primary market).
 */
function toLocalIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function enumerateDates(start: string, end: string): string[] {
  if (!start || !end) return [];
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) return [];
  const dates: string[] = [];
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    dates.push(toLocalIsoDate(d));
  }
  return dates;
}

function formatCurrency(amount: number) {
  return `₹${amount.toFixed(2)}`;
}

/** Mirrors order.ts's server-side computeChildrenCharge exactly (STANDARD) — shared formula, see quotation.ts's own recalculateQuotationTotals. */
function computeChildrenChargePreview(menu: MenuOption | undefined, below5Count: number, child5To10Count: number): number {
  if (!menu) return 0;
  const under5Charge = menu.childUnder5Chargeable ? below5Count * (menu.childUnder5Price ?? 0) : 0;
  const perChild5to10 =
    menu.child5To10PricingType === "PERCENTAGE" ? (menu.price * (menu.child5To10PriceValue ?? 0)) / 100 : (menu.child5To10PriceValue ?? 0);
  return under5Charge + child5To10Count * perChild5to10;
}

/** Mirrors order.ts's server-side computeIndividualChildrenCharge exactly (INDIVIDUAL — Per Plate/Percentage per band). */
function computeIndividualChildrenChargePreview(
  below5Rate: number,
  below5Type: string,
  child5To10Rate: number,
  child5To10Type: string,
  referenceMenuPrice: number,
  below5Count: number,
  child5To10Count: number,
): number {
  const perBelow5 = below5Type === "PERCENTAGE" ? (referenceMenuPrice * below5Rate) / 100 : below5Rate;
  const per5to10 = child5To10Type === "PERCENTAGE" ? (referenceMenuPrice * child5To10Rate) / 100 : child5To10Rate;
  return below5Count * perBelow5 + child5To10Count * per5to10;
}

/** Mirrors order.ts's server-side deriveStandardChildPricingMenuId exactly — the first (by date) meal's own assigned Menu. */
function deriveStandardChildPricingMenuIdPreview(entries: MealSelection[]): string {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.find((e) => e.menuId)?.menuId ?? "";
}

interface QuotationFormProps {
  initialValues?: Partial<QuotationFormValues>;
  customers: { id: string; name: string; phone: string }[];
  eventTypes: { id: string; name: string }[];
  menus: MenuOption[];
  header: React.ReactNode;
  headerActions?: React.ReactNode;
  beforeContent?: React.ReactNode;
  afterContent?: React.ReactNode;
  cancelHref?: string;
  /** Owner — lets the <2-days-before-event validation below be overridden instead of blocking submission. */
  canBypassDateRestriction: boolean;
  onSubmit: (formData: FormData) => Promise<ActionResult>;
  onSuccess: () => void;
  submitLabel: string;
}

export function QuotationForm({
  initialValues,
  customers,
  eventTypes,
  menus,
  header,
  headerActions,
  beforeContent,
  afterContent,
  cancelHref = "/quotations",
  canBypassDateRestriction,
  onSubmit,
  onSuccess,
  submitLabel,
}: QuotationFormProps) {
  const [values, setValues] = useState<QuotationFormValues>({ ...EMPTY_QUOTATION_VALUES, ...initialValues });
  // Edit mode's already-selected Customer, found once from the full list
  // passed down — CustomerCombobox only needs this single row to seed its
  // display text; it does its own server-side search for anything else.
  const initialSelectedCustomer: SelectedCustomer | null = initialValues?.customerId
    ? (customers.find((c) => c.id === initialValues.customerId) ?? null)
    : null;
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(initialSelectedCustomer);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Set when the form itself switched the Order Kind to Multi, so a popup can
  // say why (mirrors order-form.tsx exactly): a date range, or more than one meal type.
  const [multiNotice, setMultiNotice] = useState<"dates" | "meals" | null>(null);
  // Which meal's "Select/Edit Food Items" drawer is open — lifted here (not
  // internal to MenuPlanningSection) so the "Selected Meals" summary card
  // can also open it directly for any date, not just the sidebar-focused one.
  const [foodDialogTarget, setFoodDialogTarget] = useState<{ date: string; mealType: MealTypeValue } | null>(null);

  function setField<K extends keyof QuotationFormValues>(key: K, value: QuotationFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function setOrderKind(kind: string) {
    setField("orderKind", kind);
  }

  function autoMulti(reason: "dates" | "meals") {
    setValues((prev) => (prev.orderKind === "MULTI" ? prev : { ...prev, orderKind: "MULTI" }));
    if (values.orderKind !== "MULTI") setMultiNotice(reason);
  }

  function setEventDateRange(startDate: string, endDate: string) {
    setField("eventStartDate", startDate);
    setField("eventEndDate", endDate);
    const newDays = new Set(enumerateDates(startDate, endDate));
    setField(
      "mealPlanEntries",
      values.mealPlanEntries.filter((e) => newDays.has(e.date)),
    );
    if (startDate && endDate && startDate !== endDate) autoMulti("dates");
  }

  const days = useMemo(() => enumerateDates(values.eventStartDate, values.eventEndDate), [values.eventStartDate, values.eventEndDate]);

  /** Applies a new meal plan and, if it now spans more than one meal type, makes the Quotation Multi. Passed straight into MenuPlanningSection as its onChange. */
  function setMealPlan(entries: MealSelection[]) {
    setField("mealPlanEntries", entries);
    if (new Set(entries.map((e) => e.mealType)).size > 1) autoMulti("meals");
  }

  // Extras and per-plate add-ons are charged for every guest, like on Order's own form; everything else once.
  const guestsForPricing = (Number(values.adultCount) || 0) + (Number(values.childBelow5Count) || 0) + (Number(values.child5To10Count) || 0);
  const mealItemsSubtotal = values.mealPlanEntries.reduce(
    (sum, e) => sum + e.items.reduce((s, item) => s + item.unitPrice * (item.perGuest ? Math.max(guestsForPricing, 1) : 1), 0),
    0,
  );
  const mealsSubtotal = values.individualPricingEnabled
    ? values.mealPlanEntries.reduce((sum, e) => sum + (Number.parseFloat(e.price) || 0), 0)
    : 0;
  const childPricingMenuId = deriveStandardChildPricingMenuIdPreview(values.mealPlanEntries);
  const childPricingMenu = menus.find((m) => m.id === childPricingMenuId);
  const childrenCharge =
    values.pricingMethod === "INDIVIDUAL"
      ? computeIndividualChildrenChargePreview(
          Number.parseFloat(values.individualChildBelow5Rate) || 0,
          values.individualChildBelow5PricingType,
          Number.parseFloat(values.individualChild5To10Rate) || 0,
          values.individualChild5To10PricingType,
          childPricingMenu?.price ?? 0,
          Number(values.childBelow5Count) || 0,
          Number(values.child5To10Count) || 0,
        )
      : computeChildrenChargePreview(childPricingMenu, Number(values.childBelow5Count) || 0, Number(values.child5To10Count) || 0);
  const subtotal = mealItemsSubtotal + mealsSubtotal + childrenCharge;
  const eventDaysUntil = daysUntilPreview(values.eventStartDate);
  const eventDateRestricted = eventDaysUntil !== null && eventDaysUntil < MIN_DAYS_BEFORE_EVENT;
  const distinctMealTypes = new Set(values.mealPlanEntries.map((e) => e.mealType)).size;
  const multiRequired = days.length > 1 || distinctMealTypes > 1;
  const individualOn = values.individualPricingEnabled || values.pricingMethod === "INDIVIDUAL";
  const guestsComputed = guestsForPricing;
  const discountNum = Number.parseFloat(values.discount) || 0;
  const taxesNum = Number.parseFloat(values.taxes) || 0;
  const additionalNum = Number.parseFloat(values.additionalCharges) || 0;
  const deliveryNum = Number.parseFloat(values.deliveryCharges) || 0;
  // Mirrors quotation.ts's server-side recalculateQuotationTotals exactly.
  const total = subtotal - discountNum + taxesNum + additionalNum + deliveryNum;

  function buildFormData(): FormData {
    const formData = new FormData();
    formData.set("customerId", values.customerId);
    formData.set("eventTypeId", values.eventTypeId);
    formData.set("menuPreference", values.menuPreference);
    formData.set("orderKind", values.orderKind);
    formData.set("eventStartDate", values.eventStartDate);
    formData.set("eventEndDate", values.eventEndDate);
    formData.set("venue", values.venue);
    formData.set("eventAddress", values.eventAddress);
    formData.set("adultCount", values.adultCount);
    formData.set("childBelow5Count", values.childBelow5Count);
    formData.set("child5To10Count", values.child5To10Count);
    formData.set("totalParticipants", String(guestsComputed));
    formData.set("pricingMethod", values.pricingMethod);
    formData.set("individualChildBelow5Rate", values.individualChildBelow5Rate);
    formData.set("individualChildBelow5PricingType", values.individualChildBelow5PricingType);
    formData.set("individualChild5To10Rate", values.individualChild5To10Rate);
    formData.set("individualChild5To10PricingType", values.individualChild5To10PricingType);
    formData.set("individualPricingEnabled", String(values.individualPricingEnabled));
    formData.set("validUntil", values.validUntil);
    formData.set("terms", values.terms);
    formData.set("notes", values.notes);
    formData.set("discount", values.discount);
    formData.set("taxes", values.taxes);
    formData.set("additionalCharges", values.additionalCharges);
    formData.set("deliveryCharges", values.deliveryCharges);
    for (const entry of values.mealPlanEntries) {
      formData.append("mealDate", entry.date);
      formData.append("mealType", entry.mealType);
      formData.append("mealPrice", entry.price || "0");
      formData.append("mealMenuId", entry.menuId || "");
      formData.append(
        "mealItems",
        JSON.stringify(entry.items.map((i) => ({ itemType: i.itemType, catalogId: i.catalogId, quantity: i.perGuest ? Math.max(guestsForPricing, 1) : 1 }))),
      );
    }
    return formData;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!values.customerId) {
      setError("A Customer is required.");
      return;
    }
    if (eventDateRestricted && !canBypassDateRestriction) {
      setError(`Quotations can't normally be created or edited for an event less than ${MIN_DAYS_BEFORE_EVENT} days away. Ask an Owner.`);
      return;
    }
    const emptyMeal = values.mealPlanEntries.find((e) => e.menuId && !e.items.some((i) => i.itemType === "MENU_ITEM"));
    if (emptyMeal) {
      const label = MEAL_TYPES.find((m) => m.value === emptyMeal.mealType)?.label ?? "a meal";
      setError(`Select food items for ${label}${days.length > 1 ? ` on ${emptyMeal.date}` : ""}, or remove the meal.`);
      return;
    }
    setPending(true);

    const result = await onSubmit(buildFormData());
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSuccess();
  }

  const startsIn = startsInPreview(eventDaysUntil);
  const totalGuests = String(guestsComputed);
  const orderKindOptions = [
    { value: "SINGLE", label: "Single", hint: "One event / one meal type" },
    { value: "MULTI", label: "Multi", hint: "Multiple meals across the same event" },
  ] as const;
  const formatDay = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", opts);
  const eventDateText =
    values.eventStartDate && values.eventEndDate
      ? values.eventStartDate === values.eventEndDate
        ? formatDay(values.eventStartDate, { day: "numeric", month: "short", year: "numeric" })
        : `${formatDay(values.eventStartDate, { day: "numeric", month: "short" })} – ${formatDay(values.eventEndDate, { day: "numeric", month: "short", year: "numeric" })}`
      : "Not set";
  const eventTypeName = eventTypes.find((t) => t.id === values.eventTypeId)?.name;
  const sortedMealEntries = [...values.mealPlanEntries].sort(
    (a, b) => a.date.localeCompare(b.date) || MEAL_TYPES.findIndex((m) => m.value === a.mealType) - MEAL_TYPES.findIndex((m) => m.value === b.mealType),
  );

  function setIndividualPricing(on: boolean) {
    setValues((prev) => ({ ...prev, individualPricingEnabled: on, pricingMethod: on ? "INDIVIDUAL" : "STANDARD" }));
  }

  const individualToggle = (
    <label htmlFor="quote-individual-pricing" className="flex cursor-pointer items-center gap-2">
      <Switch id="quote-individual-pricing" checked={individualOn} onCheckedChange={setIndividualPricing} />
      <span className="text-sm font-medium">Individual Pricing {individualOn ? "On" : "Off"}</span>
    </label>
  );

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">{header}</div>
          <div className="flex flex-wrap items-center gap-2">
            {headerActions}
            <Button type="button" variant="outline" render={<Link href={cancelHref} />} nativeButton={false}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : submitLabel}
            </Button>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {beforeContent}

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          {/* ---------------- Main column ---------------- */}
          <div className="flex min-w-0 flex-col gap-4">
            {/* 1 · Customer & Event */}
            <FormSection step={1} title="Customer & Event" description="Who this Quotation is for, and where the event will take place.">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="quote-customer" required>Customer</Label>
                <CustomerCombobox
                  id="quote-customer"
                  initialCustomer={initialSelectedCustomer}
                  onSelect={(customer) => {
                    setField("customerId", customer.id);
                    setSelectedCustomer(customer);
                  }}
                  onClear={() => {
                    setField("customerId", "");
                    setSelectedCustomer(null);
                  }}
                  onSearch={searchCustomersAction}
                  onCreate={createCustomerForOrderAction}
                />
                {customers.length === 0 && (
                  <Link href="/customers" className="text-xs text-primary hover:underline">
                    No customers yet — add one first
                  </Link>
                )}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="quote-event-type">Event Type</Label>
                  <Select
                    items={Object.fromEntries(eventTypes.map((t) => [t.id, t.name]))}
                    value={values.eventTypeId}
                    onValueChange={(v) => setField("eventTypeId", v ?? values.eventTypeId)}
                  >
                    <SelectTrigger id="quote-event-type" className="w-full">
                      <SelectValue placeholder="Not set" />
                    </SelectTrigger>
                    <SelectContent>
                      {eventTypes.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="quote-event-date">Event Date</Label>
                  <div className="flex items-stretch gap-2">
                    <div className="min-w-0 flex-1">
                      <DateRangePicker
                        id="quote-event-date"
                        startDate={values.eventStartDate}
                        endDate={values.eventEndDate}
                        onChange={setEventDateRange}
                        loadOrderCounts={getOrderCountsByDayAction}
                      />
                    </div>
                    {startsIn && (
                      <div className={cn("flex shrink-0 flex-col justify-center rounded-lg px-3 text-xs leading-tight", TONE_SURFACE[startsIn.tone])}>
                        <span>{startsIn.caption}</span>
                        <span className="text-sm font-semibold">{startsIn.label}</span>
                      </div>
                    )}
                  </div>
                  {eventDateRestricted && (
                    <p className={`text-xs ${canBypassDateRestriction ? "text-warning" : "text-destructive"}`} role={canBypassDateRestriction ? undefined : "alert"}>
                      {canBypassDateRestriction
                        ? `This event is less than ${MIN_DAYS_BEFORE_EVENT} days away — you can still save this Quotation as an Owner.`
                        : `Quotations can't normally be created or edited for an event less than ${MIN_DAYS_BEFORE_EVENT} days away. Ask an Owner.`}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="quote-venue">Location / Venue</Label>
                  <IconInput icon={MapPin} id="quote-venue" value={values.venue} onChange={(e) => setField("venue", e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="quote-address">Event Address</Label>
                  <IconInput icon={MapPin} id="quote-address" value={values.eventAddress} onChange={(e) => setField("eventAddress", e.target.value)} />
                </div>
              </div>
            </FormSection>

            {/* 2 · Order Kind */}
            <FormSection
              step={2}
              title="Order Kind"
              description={
                values.orderKind === "MULTI"
                  ? multiRequired
                    ? "More than one date or meal type, so this stays Multi."
                    : "Meal Planning below groups each date into its own event."
                  : "One date and one meal type. Adding a date or another meal makes it Multi."
              }
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {orderKindOptions.map((option) => {
                  const selected = values.orderKind === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setOrderKind(option.value)}
                      disabled={option.value === "SINGLE" && multiRequired}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
                        selected ? "border-primary bg-accent/40" : "border-input hover:bg-muted/40",
                      )}
                    >
                      <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border", selected ? "border-primary" : "border-input")}>
                        {selected && <span className="size-2.5 rounded-full bg-primary" />}
                      </span>
                      <span className="flex flex-col">
                        <span className="text-sm font-semibold">{option.label}</span>
                        <span className="text-xs text-muted-foreground">{option.hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </FormSection>

            <AlertDialog open={multiNotice !== null} onOpenChange={(open) => !open && setMultiNotice(null)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Order Kind changed to Multi</AlertDialogTitle>
                  <AlertDialogDescription>
                    {multiNotice === "dates"
                      ? "You picked more than one date, so this is now Multi. Menu Planning groups each date into its own event."
                      : "You picked more than one meal type, so this is now Multi — even on a single day. Menu Planning groups the meals into their own events."}{" "}
                    Your meals, menus and food items are kept.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogAction onClick={() => setMultiNotice(null)}>Got it</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* 3 · Guests */}
            <FormSection step={3} title="Guest Information" description="Enter the expected guest count. This will be used for all selected meals.">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="quote-adults">Adults</Label>
                  <Input id="quote-adults" type="number" min="0" value={values.adultCount} onChange={(e) => setField("adultCount", e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="quote-child-below5">Children (Under 5)</Label>
                  <Input id="quote-child-below5" type="number" min="0" value={values.childBelow5Count} onChange={(e) => setField("childBelow5Count", e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="quote-child-5to10">Children (5–10)</Label>
                  <Input id="quote-child-5to10" type="number" min="0" value={values.child5To10Count} onChange={(e) => setField("child5To10Count", e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="quote-total-guests">Total Guests</Label>
                  <Input id="quote-total-guests" readOnly tabIndex={-1} className="bg-muted/40" value={String(guestsComputed)} />
                </div>
              </div>
            </FormSection>

            {/* 4 · Menu planning */}
            <FormSection step={4} title="Menu Planning" description="Select meals and assign menu items for this event." action={individualToggle}>
              <MenuPlanningSection
                idPrefix="quote"
                mealSlotTestIdPrefix="quote-"
                days={days}
                mealPlanEntries={values.mealPlanEntries}
                onChange={setMealPlan}
                menus={menus}
                menuPreference={values.menuPreference}
                onMenuPreferenceChange={(v) => setField("menuPreference", v)}
                individualPricingEnabled={individualOn}
                guestsForPricing={guestsForPricing}
                loadPickerData={getMenuForQuotationPickerAction}
                foodDialogTarget={foodDialogTarget}
                onOpenFoodDialog={(date, mealType) => setFoodDialogTarget({ date, mealType })}
                onCloseFoodDialog={() => setFoodDialogTarget(null)}
              />
            </FormSection>

            {/* 5 · Additional details */}
            <FormSection step={5} title="Additional Details" description="Validity, terms and any special notes.">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="col-span-full flex flex-col gap-1.5">
                  <Label htmlFor="quote-valid-until">Valid Until</Label>
                  <Input id="quote-valid-until" type="date" value={values.validUntil} onChange={(e) => setField("validUntil", e.target.value)} />
                </div>
                <div className="col-span-full flex flex-col gap-1.5">
                  <Label htmlFor="quote-terms">Terms</Label>
                  <Textarea id="quote-terms" value={values.terms} onChange={(e) => setField("terms", e.target.value)} />
                </div>
                <div className="col-span-full flex flex-col gap-1.5">
                  <Label htmlFor="quote-notes">Notes</Label>
                  <Textarea id="quote-notes" value={values.notes} onChange={(e) => setField("notes", e.target.value)} />
                </div>
              </div>
            </FormSection>
          </div>

          {/* ---------------- Summary column ---------------- */}
          <aside className="flex min-w-0 flex-col gap-4">
            <SummaryCard icon={User} title="Quotation Summary">
              <SummaryRow icon={User} label="Customer">
                <span className="break-words">{selectedCustomer?.name ?? "Not selected"}</span>
              </SummaryRow>
              <SummaryRow icon={Users} label="Order Kind">
                {values.orderKind === "MULTI" ? "Multi" : "Single"}
              </SummaryRow>
              <SummaryRow icon={Tag} label="Event Type">
                {eventTypeName ?? "Not set"}
              </SummaryRow>
              <SummaryRow icon={CalendarDays} label="Event Date">
                <span>{eventDateText}</span>
                {startsIn && <span className={cn("text-xs", TONE_TEXT[startsIn.tone])}>{startsIn.caption} {startsIn.label}</span>}
              </SummaryRow>
              <SummaryRow icon={MapPin} label="Venue">
                <span className="break-words">{values.venue || "Not set"}</span>
              </SummaryRow>
              <SummaryRow icon={Users} label="Guests">
                <span>{totalGuests}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  ({Number(values.adultCount) || 0} Adults, {Number(values.childBelow5Count) || 0} Children &lt;5, {Number(values.child5To10Count) || 0} Children 5–10)
                </span>
              </SummaryRow>
            </SummaryCard>

            <SummaryCard icon={UtensilsCrossed} title="Selected Meals">
              {sortedMealEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground">No meals selected yet.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {sortedMealEntries.map((entry) => {
                    const meal = MEAL_TYPES.find((m) => m.value === entry.mealType)!;
                    const state = !entry.menuId
                      ? { text: "Menu not assigned", className: "text-warning" }
                      : entry.items.length === 0
                        ? { text: "No items selected", className: "text-muted-foreground" }
                        : { text: `${entry.items.length} item${entry.items.length === 1 ? "" : "s"} selected`, className: "text-success" };
                    return (
                      <div key={`${entry.date}|${entry.mealType}`} className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          {createElement(MEAL_ICON[entry.mealType], { className: "size-4" })}
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col text-sm">
                          <span className="font-semibold">
                            {meal.label}
                            {days.length > 1 && (
                              <span className="font-normal text-muted-foreground"> · {formatDay(entry.date, { day: "numeric", month: "short" })}</span>
                            )}
                          </span>
                          <span className={cn("text-xs", state.className)}>{state.text}</span>
                        </div>
                        {entry.menuId && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Edit food items for ${meal.label}${days.length > 1 ? ` on ${formatDay(entry.date, { day: "numeric", month: "short" })}` : ""}`}
                            onClick={() => setFoodDialogTarget({ date: entry.date, mealType: entry.mealType as MealTypeValue })}
                          >
                            <PenSquare className="size-4" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </SummaryCard>

            <SummaryCard icon={Wallet} title="Pricing Details">
              <p className="text-xs text-muted-foreground">
                {individualOn
                  ? "Individual Pricing is on (switch it in Menu Planning). Each meal's price is set on its own card there; children can be Per Plate or a Percentage of the first assigned Menu's price."
                  : "Meals use their Menu's rates. Children (Under 5) / (5–10) are charged with the child rates of the first Menu assigned in Menu Planning. Turn on Individual Pricing in Menu Planning to set your own."}
              </p>
              {individualOn && (
                <div className="flex flex-col gap-3">
                  {(
                    [
                      { id: "quote-individual-below5", label: "Children (Under 5) price", rate: "individualChildBelow5Rate", type: "individualChildBelow5PricingType" },
                      { id: "quote-individual-5to10", label: "Children (5–10) price", rate: "individualChild5To10Rate", type: "individualChild5To10PricingType" },
                    ] as const
                  ).map((row) => (
                    <div key={row.id} className="flex flex-col gap-1.5">
                      <Label htmlFor={`${row.id}-rate`}>{row.label}</Label>
                      <div className="flex gap-2">
                        <Input
                          id={`${row.id}-rate`}
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-28"
                          value={values[row.rate]}
                          onChange={(e) => setField(row.rate, e.target.value)}
                        />
                        <Select
                          items={Object.fromEntries(CHILD_PRICING_TYPE_OPTIONS.map((o) => [o.value, o.label]))}
                          value={values[row.type]}
                          onValueChange={(v) => setField(row.type, v ?? values[row.type])}
                        >
                          <SelectTrigger className="min-w-0 flex-1" aria-label={`${row.label} type`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CHILD_PRICING_TYPE_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-col gap-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Total Amount</span>
                  <span className="text-base font-semibold">{formatCurrency(mealItemsSubtotal + mealsSubtotal)}</span>
                </div>
                {childrenCharge > 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Children Charges</span>
                    <span>{formatCurrency(childrenCharge)}</span>
                  </div>
                )}
                {(
                  [
                    { id: "quote-taxes", label: "Taxes", key: "taxes" },
                    { id: "quote-additional", label: "Additional Charges", key: "additionalCharges" },
                    { id: "quote-delivery", label: "Delivery Charges", key: "deliveryCharges" },
                    { id: "quote-discount", label: "Discount", key: "discount" },
                  ] as const
                ).map((row) => (
                  <div key={row.id} className="flex items-center justify-between gap-3">
                    <Label htmlFor={row.id} className="font-normal text-muted-foreground">
                      {row.label}
                    </Label>
                    <Input
                      id={row.id}
                      type="number"
                      min="0"
                      step="0.01"
                      className="w-32 text-right"
                      value={values[row.key]}
                      onChange={(e) => setField(row.key, e.target.value)}
                    />
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg bg-accent px-4 py-3 font-semibold text-accent-foreground">
                <span>Grand Total</span>
                <span className="text-lg">{formatCurrency(total)}</span>
              </div>
              <div className="flex items-start gap-2 rounded-lg bg-info/10 p-3 text-xs text-info">
                <Info className="mt-0.5 size-4 shrink-0" />
                <span>Payment isn&apos;t tracked on a Quotation — once accepted, convert it to an Order to record payment.</span>
              </div>
            </SummaryCard>
          </aside>
        </div>
      </form>
      {afterContent}
    </>
  );
}
