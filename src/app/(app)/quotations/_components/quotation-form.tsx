"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ClipboardList, FileText, Info, MapPin, Plus, Tag, Trash2, User, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconInput } from "@/components/ui/icon-input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  MenuPlanningSection,
  MEAL_TYPES,
  type MealSelection,
  type MenuOption,
  type MealTypeValue,
} from "@/components/catalog/menu-planning-section";
import { CustomerCombobox, type SelectedCustomer } from "@/components/customers/customer-combobox";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { cn } from "cn";
import { FormSection, SummaryCard, SummaryRow } from "../../orders/_components/order-form-parts";
import { FormTabs, type FormTab } from "../../orders/_components/form-tabs";
import { computeChildrenCharge, computeIndividualChildrenCharge, deriveStandardChildPricingMenuId, priceMeals, type ChildPricingType } from "@/modules/orders/meal-pricing";
import { customChargeInput, daysUntilPreview, enumerateDates, formatCurrency, startsInPreview } from "@/components/orders/form-helpers";
import { toLocalIsoDate } from "@/lib/time/local-date";
import { percentOf } from "@/modules/orders/amount";
import { quotationMissingField, quotationMissingMessage } from "@/modules/quotations/required-fields";
import { MAX_CUSTOM_CHARGES, parseCustomCharges, resolveCustomCharges, sumCustomCharges } from "@/modules/orders/custom-charges";
import { IconTip } from "@/components/ui/icon-tip";
import { QuotationMenuNotices } from "./quotation-menu-notices";
import { QuotationLockBanner } from "./quotation-lock-banner";
import { isQuotationEditable } from "@/modules/quotations/quotation-lock";
import type { QuotationStatus } from "@/generated/prisma/enums";
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
  /** Discount, Transportation and Extra / Service Cost: a rupee amount, or (mode PERCENTAGE) a percentage of the subtotal. Either way the typed number lives in the field. */
  discount: string;
  discountMode: "FIXED" | "PERCENTAGE";
  transportationCost: string;
  transportationMode: "FIXED" | "PERCENTAGE";
  otherCharges: string;
  otherChargesMode: "FIXED" | "PERCENTAGE";
  /** Team-added label + amount lines (amount typed as text, like the other money fields). */
  customCharges: { label: string; amount: string; mode: "FIXED" | "PERCENTAGE" }[];
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
  discountMode: "FIXED",
  transportationCost: "0",
  transportationMode: "FIXED",
  otherCharges: "0",
  otherChargesMode: "FIXED",
  customCharges: [],
  mealPlanEntries: [],
};

interface QuotationFormProps {
  initialValues?: Partial<QuotationFormValues>;
  /** The quotation's stage and the customer's last message, for the alerts on the Build Menu tab. A new quotation has neither. */
  status?: QuotationStatus;
  customerMessage?: string | null;
  /** The saved quotation's id (not on the create page): the lock notice recalls it. */
  quotationId?: string;
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
  /** Whether the viewer may see prices (Sensitive data: orderPrices). When false the server sent none; the Pricing tab and totals are not drawn and the server keeps the saved pricing. */
  showPrices?: boolean;
  onSubmit: (formData: FormData) => Promise<ActionResult>;
  onSuccess: () => void;
  submitLabel: string;
}

export function QuotationForm({
  initialValues,
  status,
  customerMessage,
  quotationId,
  customers,
  eventTypes,
  menus,
  header,
  headerActions,
  beforeContent,
  afterContent,
  cancelHref = "/quotations",
  canBypassDateRestriction,
  showPrices = true,
  onSubmit,
  onSuccess,
  submitLabel,
}: QuotationFormProps) {
  const [values, setValues] = useState<QuotationFormValues>({
    ...EMPTY_QUOTATION_VALUES,
    ...initialValues,
  });
  // Edit mode's already-selected Customer, found once from the full list
  // passed down — CustomerCombobox only needs this single row to seed its
  // display text; it does its own server-side search for anything else.
  const initialSelectedCustomer: SelectedCustomer | null = initialValues?.customerId
    ? (customers.find((c) => c.id === initialValues.customerId) ?? null)
    : null;
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(initialSelectedCustomer);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // A sent quotation is locked, like an order while its menu is with the customer: only a Draft, or one sent back with Changes Requested, can be edited.
  const locked = status !== undefined && !isQuotationEditable(status);
  // Asked when a Multi Order picked by hand has one day and now one meal: is it really a Single Order?
  const [singleAsk, setSingleAsk] = useState(false);
  // Set when the form itself switched the Order Kind to Multi, so a popup can
  // say why (mirrors order-form.tsx exactly): a date range, or more than one meal type.
  const [multiNotice, setMultiNotice] = useState<"dates" | "meals" | "multiOff" | null>(null);
  // Which meal's "Select/Edit Food Items" drawer is open — lifted here (not
  // internal to MenuPlanningSection) so the "Selected Meals" summary card
  // can also open it directly for any date, not just the sidebar-focused one.
  const [foodDialogTarget, setFoodDialogTarget] = useState<{
    date: string;
    mealType: MealTypeValue;
  } | null>(null);

  // True while Multi was chosen by the form itself (not clicked), so it can flip back to Single on its own.
  const [autoSwitchedToMulti, setAutoSwitchedToMulti] = useState(false);

  function setField<K extends keyof QuotationFormValues>(key: K, value: QuotationFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function setOrderKind(kind: string) {
    setAutoSwitchedToMulti(false);
    setField("orderKind", kind);
  }

  function autoMulti(reason: "dates" | "meals") {
    setValues((prev) => (prev.orderKind === "MULTI" ? prev : { ...prev, orderKind: "MULTI" }));
    if (values.orderKind !== "MULTI") {
      setMultiNotice(reason);
      setAutoSwitchedToMulti(true);
    }
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
    // A Multi Order chosen by hand, one event day, and now exactly one meal: that is a Single Order, so ask.
    if (values.orderKind === "MULTI" && !autoSwitchedToMulti && days.length <= 1 && entries.length === 1 && values.mealPlanEntries.length !== 1) setSingleAsk(true);
  }

  // One pricing rule everywhere (meal-pricing.ts): a meal costs its Menu's price x guests; only Extra dishes and add-ons move the price.
  // Per-guest Extras and add-ons count adults only, like the Menu price (menuGuestCount in meal-pricing.ts); children have their own charges.
  const guestsForPricing = Number(values.adultCount) || 0;
  const pricedMeals = priceMeals(
    values.mealPlanEntries.map((e) => ({
      price: e.price.trim() === "" ? null : Number.parseFloat(e.price) || 0,
      menuPricePerPlate: menus.find((m) => m.id === e.menuId)?.price ?? null,
      items: e.items.map((item) => ({
        itemType: item.itemType,
        unitPrice: item.unitPrice,
        quantity: item.perGuest ? Math.max(guestsForPricing, 1) : 1,
        isExtra: item.itemType === "MENU_ITEM" && item.perGuest,
      })),
    })),
    values.individualPricingEnabled,
    Number(values.adultCount) || 0,
  );
  const mealItemsSubtotal = pricedMeals.extrasAmount;
  const mealsSubtotal = pricedMeals.menuAmount;
  const childPricingMenuId = deriveStandardChildPricingMenuId(values.mealPlanEntries) ?? "";
  const childPricingMenu = menus.find((m) => m.id === childPricingMenuId);
  // Same rule as the server (usesIndividualChildRates): the Individual Pricing switch with a typed child price, or the method.
  const individualChildRates =
    values.pricingMethod === "INDIVIDUAL" ||
    (values.individualPricingEnabled && ((Number.parseFloat(values.individualChildBelow5Rate) || 0) > 0 || (Number.parseFloat(values.individualChild5To10Rate) || 0) > 0));
  const childrenCharge =
    individualChildRates
      ? computeIndividualChildrenCharge(
          { individualChildBelow5Rate: Number.parseFloat(values.individualChildBelow5Rate) || 0, individualChildBelow5PricingType: values.individualChildBelow5PricingType as ChildPricingType, individualChild5To10Rate: Number.parseFloat(values.individualChild5To10Rate) || 0, individualChild5To10PricingType: values.individualChild5To10PricingType as ChildPricingType },
          childPricingMenu?.price ?? 0,
          Number(values.childBelow5Count) || 0,
          Number(values.child5To10Count) || 0,
        )
      : computeChildrenCharge(childPricingMenu ? { ...childPricingMenu, pricePerPlate: childPricingMenu.price } : null, Number(values.childBelow5Count) || 0, Number(values.child5To10Count) || 0);
  const subtotal = mealItemsSubtotal + mealsSubtotal + childrenCharge;
  const eventDaysUntil = daysUntilPreview(values.eventStartDate);
  const eventDateRestricted = eventDaysUntil !== null && eventDaysUntil < MIN_DAYS_BEFORE_EVENT;
  const distinctMealTypes = new Set(values.mealPlanEntries.map((e) => e.mealType)).size;
  const multiRequired = days.length > 1 || distinctMealTypes > 1;
  // Back to one date and one meal type: undo the automatic switch (AJ, 2026-09-30). A Multi the user picked by hand stays.
  if (autoSwitchedToMulti && !multiRequired) {
    setAutoSwitchedToMulti(false);
    if (values.orderKind === "MULTI") {
      setField("orderKind", "SINGLE");
      // Say so, as an order does: removing a meal or a date took it back to one date and one meal type.
      setMultiNotice("multiOff");
    }
  }
  const individualOn = values.individualPricingEnabled || values.pricingMethod === "INDIVIDUAL";
  const guestsComputed = guestsForPricing;
  // A percentage is of the subtotal (meals + children), to the paisa, like the server (quotation.ts, via percentOf).
  const transportationCostNum = values.transportationMode === "PERCENTAGE" ? percentOf(subtotal, Number.parseFloat(values.transportationCost) || 0) : Number.parseFloat(values.transportationCost) || 0;
  const discountNum = values.discountMode === "PERCENTAGE" ? percentOf(subtotal, Number.parseFloat(values.discount) || 0) : Number.parseFloat(values.discount) || 0;
  const otherChargesNum = values.otherChargesMode === "PERCENTAGE" ? percentOf(subtotal, Number.parseFloat(values.otherCharges) || 0) : Number.parseFloat(values.otherCharges) || 0;
  // A percentage line is a rate of the subtotal; the server resolves it the same way (resolveCustomCharges).
  const customChargeLines = resolveCustomCharges(parseCustomCharges(values.customCharges.map(customChargeInput)), subtotal);
  const customChargesNum = sumCustomCharges(customChargeLines);
  // Mirrors quotation.ts's server-side recalculateQuotationTotals exactly.
  const total = subtotal - discountNum + transportationCostNum + otherChargesNum + customChargesNum;

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
    formData.set("discount", String(discountNum));
    formData.set("discountMode", values.discountMode);
    formData.set("discountRate", values.discountMode === "PERCENTAGE" ? values.discount || "0" : "0");
    formData.set("transportationCost", String(transportationCostNum));
    formData.set("transportationMode", values.transportationMode);
    formData.set("transportationRate", values.transportationMode === "PERCENTAGE" ? values.transportationCost || "0" : "0");
    formData.set("otherCharges", String(otherChargesNum));
    formData.set("otherChargesMode", values.otherChargesMode);
    formData.set("otherChargesRate", values.otherChargesMode === "PERCENTAGE" ? values.otherCharges || "0" : "0");
    formData.set("customCharges", JSON.stringify(values.customCharges.map((c, i) => ({ ...customChargeInput(c), amount: customChargeLines[i]?.amount ?? 0 }))));
    for (const entry of values.mealPlanEntries) {
      formData.append("mealDate", entry.date);
      formData.append("mealType", entry.mealType);
      formData.append("mealPrice", entry.price || "0");
      formData.append("mealMenuId", entry.menuId || "");
      formData.append(
        "mealItems",
        JSON.stringify(
          entry.items.map((i) => ({
            itemType: i.itemType,
            catalogId: i.catalogId,
            quantity: i.perGuest ? Math.max(guestsForPricing, 1) : 1,
            isExtra: i.itemType === "MENU_ITEM" && i.perGuest,
          })),
        ),
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
    // The same four a quotation can never go without (the server checks them too).
    const missing = quotationMissingField({ eventTypeId: values.eventTypeId, eventStartDate: values.eventStartDate, eventEndDate: values.eventEndDate, venue: values.venue, adultCount: values.adultCount });
    if (missing) {
      setError(quotationMissingMessage(missing));
      return;
    }
    if (eventDateRestricted && !canBypassDateRestriction) {
      setError(`Quotations can't normally be created or edited for an event less than ${MIN_DAYS_BEFORE_EVENT} days away. Ask an Owner.`);
      return;
    }
    // Only for a new quotation: older ones saved without a preference stay editable.
    if (!initialValues && values.mealPlanEntries.length > 0 && !values.menuPreference) {
      setError("Choose a Menu Preference (Vegetarian or Non-Vegetarian) before saving the meals.");
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
  // How long the quotation stays valid, in the same chip style as the event's countdown.
  const validDays = daysUntilPreview(values.validUntil);
  const validIn = validDays === null ? null : startsInPreview(validDays);
  const totalGuests = String(guestsComputed);
  const orderKindOptions = [
    { value: "SINGLE", label: "Single Order", hint: "One date, one meal type" },
    { value: "MULTI", label: "Multi Order", hint: "Several meals, several dates, or both" },
  ] as const;
  const formatDay = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", opts);
  const eventDateText =
    values.eventStartDate && values.eventEndDate
      ? values.eventStartDate === values.eventEndDate
        ? formatDay(values.eventStartDate, {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : `${formatDay(values.eventStartDate, { day: "numeric", month: "short" })} – ${formatDay(values.eventEndDate, { day: "numeric", month: "short", year: "numeric" })}`
      : "Not set";
  const eventTypeName = eventTypes.find((t) => t.id === values.eventTypeId)?.name;

  function setIndividualPricing(on: boolean) {
    setValues((prev) => ({
      ...prev,
      individualPricingEnabled: on,
      pricingMethod: on ? "INDIVIDUAL" : "STANDARD",
    }));
  }


  const isMulti = values.orderKind === "MULTI";

  const customerSection = (
    <FormSection icon={User} title="Customer Details" description="Who this quotation is for.">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="quote-customer" required>
          Customer
        </Label>
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
      <div className="grid grid-cols-1 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="quote-customer-email">Email</Label>
          <Input id="quote-customer-email" readOnly tabIndex={-1} className="bg-muted" value={selectedCustomer?.email ?? ""} placeholder="Filled in from the customer" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="quote-customer-phone">Phone</Label>
          <PhoneInput id="quote-customer-phone" disabled value={selectedCustomer?.phone ?? ""} onChange={() => {}} />
        </div>
      </div>
    </FormSection>
  );

  const eventSection = (
    <FormSection icon={CalendarDays} title="Event Information" description="The event, its date and where it takes place.">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2 sm:col-span-2" role="group" aria-label="Order Type">
          <Label>Order Type</Label>
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
                    selected ? "border-primary bg-accent/40" : "border-input hover:bg-muted",
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
          {multiRequired && <p className="text-xs text-muted-foreground">More than one date or meal type, so this stays Multi.</p>}
        </div>

        <div className={cn("flex flex-col gap-1.5", isMulti && "sm:col-span-2")}>
          <Label htmlFor="quote-event-type" required>
            Event Type
          </Label>
          <Select items={Object.fromEntries(eventTypes.map((t) => [t.id, t.name]))} value={values.eventTypeId} onValueChange={(v) => setField("eventTypeId", v ?? values.eventTypeId)}>
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

        <div className={cn("flex flex-col gap-1.5", isMulti && "sm:col-span-2")}>
          <Label htmlFor={isMulti ? "quote-event-start" : "quote-event-date"} required>
            {isMulti ? "Event Dates" : "Event Date"}
          </Label>
          <div className="flex items-stretch gap-2">
            {isMulti ? (
              <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Event start date</span>
                  <DateRangePicker
                    single
                    id="quote-event-start"
                    ariaLabel="Event start date"
                    startDate={values.eventStartDate}
                    endDate={values.eventStartDate}
                    onChange={(start) => setEventDateRange(start, values.eventEndDate && values.eventEndDate >= start ? values.eventEndDate : start)}
                    loadOrderCounts={getOrderCountsByDayAction}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Event end date</span>
                  <DateRangePicker
                    single
                    id="quote-event-end"
                    ariaLabel="Event end date"
                    startDate={values.eventEndDate}
                    endDate={values.eventEndDate}
                    onChange={(end) => setEventDateRange(values.eventStartDate || end, end)}
                    minDate={values.eventStartDate || undefined}
                    loadOrderCounts={getOrderCountsByDayAction}
                  />
                </div>
              </div>
            ) : (
              <div className="min-w-0 flex-1">
                <DateRangePicker single id="quote-event-date" startDate={values.eventStartDate} endDate={values.eventStartDate} onChange={(day) => setEventDateRange(day, day)} loadOrderCounts={getOrderCountsByDayAction} />
              </div>
            )}
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

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="quote-venue" required>
            Venue Location
          </Label>
          <IconInput icon={MapPin} id="quote-venue" value={values.venue} onChange={(e) => setField("venue", e.target.value)} />
        </div>
      </div>
    </FormSection>
  );

  const singleAskDialog = (
    <AlertDialog open={singleAsk} onOpenChange={(open) => !open && setSingleAsk(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Change this quotation to a Single Order?</AlertDialogTitle>
          <AlertDialogDescription>It has one event day and one meal, which is a Single Order. Multi Order is for several meals, several dates, or both. Your meal, menu and food items are kept.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep Multi Order</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setOrderKind("SINGLE");
              setSingleAsk(false);
            }}
          >
            Change to Single Order
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  const kindDialog = (
    <AlertDialog open={multiNotice !== null} onOpenChange={(open) => !open && setMultiNotice(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{multiNotice === "multiOff" ? "Order Type changed to Single Order" : "Order Type changed to Multi Order"}</AlertDialogTitle>
          <AlertDialogDescription>
            {multiNotice === "multiOff"
              ? "This is now a Single Order: one date and one meal type."
              : multiNotice === "dates"
                ? "You picked more than one date, so this is now a Multi Order. Menu Planning groups each date into its own event."
                : "You picked more than one meal type, so this is now a Multi Order, even on a single day. Menu Planning groups the meals into their own events."}{" "}
            {multiNotice === "multiOff" ? "" : "Your meals, menus and food items are kept."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={() => setMultiNotice(null)}>Got it</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  const guestSection = (
    <FormSection icon={Users} title="Guest Information" description="Enter the expected guest count. This will be used for all selected meals.">
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="quote-adults" required>Adults</Label>
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
          <Input id="quote-total-guests" readOnly tabIndex={-1} className="bg-muted" value={String(guestsComputed)} />
        </div>
      </div>
    </FormSection>
  );

  // Days that carry meals but fall outside the event dates (the dates were changed after the menu was planned).
  const outsideDays = [...new Set(values.mealPlanEntries.map((e) => e.date))].filter((d) => !days.includes(d)).sort();
  const buildMenuTab = (
    <div className="flex flex-col gap-4" data-testid="quotation-build-menu">
      <QuotationMenuNotices
        status={status}
        customerMessage={customerMessage}
        outsideDays={outsideDays}
        noDates={days.length === 0}
        noAdults={values.mealPlanEntries.length > 0 && guestsForPricing < 1}
      />
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
        readOnly={locked}
        sectioned
        priceInPricingTab
        hidePrices={!showPrices}
        outsideDays={outsideDays}
      />
    </div>
  );

  const additionalSection = (
    <FormSection icon={ClipboardList} title="Additional Details" description="Validity, terms and any special notes.">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="col-span-full flex flex-col gap-1.5">
          <Label htmlFor="quote-valid-until">Valid Until</Label>
          <div className="flex items-stretch gap-2">
            <div className="min-w-0 flex-1">
              <DateRangePicker single id="quote-valid-until" placeholder="Select a date" startDate={values.validUntil} endDate={values.validUntil} onChange={(day) => setField("validUntil", day)} minDate={toLocalIsoDate(new Date())} />
            </div>
            {validIn && (
              <div className={cn("flex shrink-0 flex-col justify-center rounded-lg px-3 text-xs leading-tight", TONE_SURFACE[validIn.tone])}>
                <span>Valid for</span>
                <span className="text-sm font-semibold">{validIn.label}</span>
              </div>
            )}
          </div>
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
  );

  const summaryCard = (
    <SummaryCard icon={User} title="Quotation Summary">
      <SummaryRow icon={User} label="Customer">
        <span className="break-words">{selectedCustomer?.name ?? "Not selected"}</span>
      </SummaryRow>
      <SummaryRow icon={Users} label="Order Type">
        {values.orderKind === "MULTI" ? "Multi Order" : "Single Order"}
      </SummaryRow>
      <SummaryRow icon={Tag} label="Event Type">
        {eventTypeName ?? "Not set"}
      </SummaryRow>
      <SummaryRow icon={CalendarDays} label="Event Date">
        <span>{eventDateText}</span>
        {startsIn && (
          <span className={cn("text-xs", TONE_TEXT[startsIn.tone])}>
            {startsIn.caption} {startsIn.label}
          </span>
        )}
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
  );

  /** One row per meal for the Per Plate Pricing list: what it is, its menu, the menu's per-plate price and the meal's own entry. */
  const pricedMealRows = [...values.mealPlanEntries]
    .sort((a, b) => a.date.localeCompare(b.date) || MEAL_TYPES.findIndex((m) => m.value === a.mealType) - MEAL_TYPES.findIndex((m) => m.value === b.mealType))
    .map((entry) => {
      const menu = menus.find((m) => m.id === entry.menuId);
      const mealLabel = MEAL_TYPES.find((m) => m.value === entry.mealType)?.label ?? entry.mealType;
      return {
        key: `${entry.date}|${entry.mealType}`,
        entry,
        title: `${formatDay(entry.date, { weekday: "short", day: "numeric", month: "short" })} · ${mealLabel}`,
        menuName: menu?.name ?? "No menu",
        menuPrice: menu?.price ?? 0,
      };
    });

  /** A small (i) next to a price label, with the explanation on hover (and for a screen reader). */
  const hintIcon = (text: string) => (
    <IconTip label={text}>
      <button type="button" aria-label={text} className="inline-flex text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
        <Info className="size-4" />
      </button>
    </IconTip>
  );
  /** The ₹ / % choice joined to its amount box. */
  const amountGroup = (opts: { label: string; mode: "FIXED" | "PERCENTAGE"; onMode: (mode: "FIXED" | "PERCENTAGE") => void; inputId?: string; inputLabel?: string; value: string; onValue: (value: string) => void }) => (
    <div className="flex items-center">
      <Select items={{ FIXED: "₹", PERCENTAGE: "%" }} value={opts.mode} onValueChange={(v) => opts.onMode(v === "PERCENTAGE" ? "PERCENTAGE" : "FIXED")}>
        <SelectTrigger aria-label={`${opts.label} type`} className="w-16 rounded-r-none border-r-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="FIXED">₹</SelectItem>
          <SelectItem value="PERCENTAGE">%</SelectItem>
        </SelectContent>
      </Select>
      <Input
        id={opts.inputId}
        aria-label={opts.inputLabel}
        type="number"
        min="0"
        max={opts.mode === "PERCENTAGE" ? 100 : undefined}
        step="0.01"
        className="w-28 rounded-l-none text-right"
        value={opts.value}
        onChange={(e) => opts.onValue(e.target.value)}
      />
    </div>
  );

  const pricingEditorCard = (
  <SummaryCard icon={FileText} title="Pricing Details" description="Set per-plate pricing, children charges and additional costs for this event.">
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold">Individual / Custom Pricing</p>
        <p className="text-sm text-muted-foreground">
          {individualOn ? "On: set your own per-plate price for each meal and each child age band." : "Off: prices come from each meal's menu. Turn on to set your own."}
        </p>
      </div>
      <Switch id="quote-individual-pricing-tab" aria-label="Individual / Custom Pricing" checked={individualOn} onCheckedChange={setIndividualPricing} disabled={locked} />
    </div>

    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-base font-semibold">Per Plate Pricing</h3>
        <p className="text-sm text-muted-foreground">{individualOn ? "Your price per plate for each meal." : "Each meal's per-plate price from its menu."}</p>
      </div>
      {pricedMealRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No meals yet. Add meals in Menu Planning.</p>
      ) : (
        pricedMealRows.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-3 text-sm" data-testid="per-plate-row">
            <div className="min-w-0">
              <p className="font-medium">{row.title}</p>
              <p className="text-xs text-muted-foreground">{row.menuName} · {Number(values.adultCount) || 0} adults</p>
            </div>
            {individualOn ? (
              <div className="flex shrink-0 flex-col items-end gap-1">
              <div className="flex items-center gap-2">
                <div className="flex items-center">
                  <span className="flex h-10 w-12 items-center justify-center rounded-l-lg border border-r-0 border-input text-sm" aria-hidden>
                    ₹
                  </span>
                  <Input
                    aria-label={`${row.title} price per plate`}
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-28 rounded-l-none text-right"
                    value={row.entry.price}
                    onChange={(e) => setField("mealPlanEntries", values.mealPlanEntries.map((m) => (m.date === row.entry.date && m.mealType === row.entry.mealType ? { ...m, price: e.target.value } : m)))}
                  />
                </div>
                <span className="text-xs text-muted-foreground">/ plate</span>
              </div>
              {/* What the price was before: the menu's own price, so the team can see what they are changing. */}
              {row.menuName !== "No menu" && (
                <span className="text-xs text-muted-foreground" data-testid="default-plate-price">
                  Menu price {formatCurrency(row.menuPrice)} / plate
                </span>
              )}
              </div>
            ) : (
              <span className="shrink-0 font-medium">{formatCurrency(row.menuPrice)} <span className="text-xs font-normal text-muted-foreground">/ plate</span></span>
            )}
          </div>
        ))
      )}
    </div>

    {individualOn && (
      <div className="flex flex-col gap-4">
        {/* Each meal's own price is set inline on its card in Menu Planning above, not duplicated here (AJ's reference, 2026-09-29). */}
        {(
          [
            { id: "quote-individual-below5", label: "Children (Under 5) price", hint: "Charge for children below 5 years.", rate: "individualChildBelow5Rate", type: "individualChildBelow5PricingType" },
            { id: "quote-individual-5to10", label: "Children (5–10) price", hint: "Charge for children between 5 and 10 years.", rate: "individualChild5To10Rate", type: "individualChild5To10PricingType" },
          ] as const
        ).map((row) => (
          <div key={row.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label htmlFor={`${row.id}-rate`} className="font-normal whitespace-nowrap text-muted-foreground">
                {row.label}
              </Label>
              {hintIcon(row.hint)}
            </div>
            {amountGroup({
              label: row.label,
              mode: values[row.type] === "PERCENTAGE" ? "PERCENTAGE" : "FIXED",
              onMode: (mode) => setField(row.type, mode),
              inputId: `${row.id}-rate`,
              value: values[row.rate],
              onValue: (value) => setField(row.rate, value),
            })}
          </div>
        ))}
        {childPricingMenu && (
          <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground" data-testid="menu-child-defaults">
            <p className="font-medium text-foreground">Menu default ({childPricingMenu.name})</p>
            <p>Children (Under 5): {childPricingMenu.childUnder5Chargeable ? `${formatCurrency(childPricingMenu.childUnder5Price ?? 0)} per plate` : "Complimentary"}</p>
            <p>
              Children (5–10):{" "}
              {childPricingMenu.child5To10PricingType === "PERCENTAGE" ? `${childPricingMenu.child5To10PriceValue ?? 0}% of the plate price` : `${formatCurrency(childPricingMenu.child5To10PriceValue ?? 0)} per plate`}
            </p>
          </div>
        )}
      </div>
    )}
    {!individualOn && childPricingMenu && (
      <div className="flex flex-col gap-1.5 text-sm" data-testid="menu-child-rates">
        <h3 className="text-base font-semibold">Children</h3>
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">Children (Under 5)</span>
          <span className="font-medium">{childPricingMenu.childUnder5Chargeable ? `${formatCurrency(childPricingMenu.childUnder5Price ?? 0)} per plate` : "Complimentary"}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">Children (5–10)</span>
          <span className="font-medium">
            {childPricingMenu.child5To10PricingType === "PERCENTAGE" ? `${childPricingMenu.child5To10PriceValue ?? 0}% of the plate price` : `${formatCurrency(childPricingMenu.child5To10PriceValue ?? 0)} per plate`}
          </span>
        </div>
      </div>
    )}
    <div className="flex flex-col gap-2.5 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground">Total Amount</span>
        <span className="text-base font-semibold">{formatCurrency(mealItemsSubtotal + mealsSubtotal)}</span>
      </div>
      {(Number(values.childBelow5Count) || 0) + (Number(values.child5To10Count) || 0) > 0 && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Children Charges</span>
          <span>{formatCurrency(childrenCharge)}</span>
        </div>
      )}
    </div>
    {(Number(values.childBelow5Count) || 0) + (Number(values.child5To10Count) || 0) > 0 && childrenCharge === 0 && (
      <p className="flex items-start gap-2 rounded-lg bg-info/10 p-3 text-sm text-info" data-testid="children-no-rate">
        <Info className="mt-0.5 size-4 shrink-0" />
        <span>
          {childPricingMenu
            ? individualOn
              ? "No child rate is set. Enter the child prices above."
              : `${childPricingMenu.name} has no child rate set, so children are not charged. Set it on the Menu, or turn on Individual Pricing.`
            : "Children are priced from the first Menu assigned in Menu Planning. Assign a Menu to charge them."}
        </span>
      </p>
    )}

    <div className="flex flex-col gap-4 border-t border-border pt-5">
      <div>
        <h3 className="text-base font-semibold">Additional Costs</h3>
        <p className="text-sm text-muted-foreground">Add transport charges, service costs, discounts or any other charges.</p>
      </div>
      {(
        [
          { id: "quote-transportation-cost", label: "Transportation Cost", hint: "Cost of getting the food and crew to the venue.", key: "transportationCost", modeKey: "transportationMode" },
          { id: "quote-other-charges", label: "Extra / Service Cost", hint: "Any extra service charge on top of the meals.", key: "otherCharges", modeKey: "otherChargesMode" },
          { id: "quote-discount", label: "Discount", hint: "Taken off the total. A percentage is of the meals and children charges.", key: "discount", modeKey: "discountMode" },
        ] as const
      ).map((row) => (
        <div key={row.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <div className="flex items-center gap-1.5">
            <Label htmlFor={row.id} className="font-normal whitespace-nowrap text-muted-foreground">
              {row.label}
            </Label>
            {hintIcon(row.hint)}
          </div>
          {amountGroup({
            label: row.label,
            mode: values[row.modeKey],
            onMode: (mode) => setField(row.modeKey, mode),
            inputId: row.id,
            value: values[row.key],
            onValue: (value) => setField(row.key, value),
          })}
        </div>
      ))}
    </div>

    <div className="flex flex-col gap-3 border-t border-border pt-5">
      <div>
        <h3 className="text-base font-semibold">
          Other Charges <span className="text-sm font-normal text-muted-foreground">(Optional)</span>
        </h3>
        <p className="text-sm text-muted-foreground">Add custom charges such as generator, venue service, etc.</p>
      </div>
      {values.customCharges.map((row, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          <Input
            aria-label={`Charge ${index + 1} label`}
            placeholder="Label (e.g. Generator)"
            maxLength={80}
            className="min-w-40 flex-1 basis-full sm:basis-0"
            value={row.label}
            onChange={(e) => setField("customCharges", values.customCharges.map((c, i) => (i === index ? { ...c, label: e.target.value } : c)))}
          />
          {amountGroup({
            label: `Charge ${index + 1}`,
            mode: row.mode,
            onMode: (mode) => setField("customCharges", values.customCharges.map((c, i) => (i === index ? { ...c, mode } : c))),
            inputLabel: `Charge ${index + 1} amount`,
            value: row.amount,
            onValue: (value) => setField("customCharges", values.customCharges.map((c, i) => (i === index ? { ...c, amount: value } : c))),
          })}
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={`Remove charge ${index + 1}`}
            onClick={() => setField("customCharges", values.customCharges.filter((_, i) => i !== index))}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      {values.customCharges.length < MAX_CUSTOM_CHARGES && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => setField("customCharges", [...values.customCharges, { label: "", amount: "", mode: "FIXED" }])}
        >
          <Plus className="size-4" /> Add charge
        </Button>
      )}
    </div>
    <div className="flex items-center justify-between gap-3 rounded-lg bg-accent px-4 py-3 text-accent-foreground">
      <span className="flex flex-col">
        <span className="font-semibold">Grand Total</span>
        <span className="text-xs font-normal">Including all charges and discounts</span>
      </span>
      <span className="text-xl font-semibold">{formatCurrency(total)}</span>
    </div>
    <div className="flex items-start gap-2 rounded-lg bg-info/10 p-3 text-xs text-info">
      <Info className="mt-0.5 size-4 shrink-0" />
      <span>Payment isn&apos;t tracked on a Quotation — once accepted, convert it to an Order to record payment.</span>
    </div>
  </SummaryCard>
  );

  const pricingSummaryCard = (
    <SummaryCard icon={Wallet} title="Pricing Details">
      <div className="flex flex-col gap-3 text-sm">
        {[
          { label: "Total Amount", amount: mealItemsSubtotal + mealsSubtotal },
          ...((Number(values.childBelow5Count) || 0) + (Number(values.child5To10Count) || 0) > 0 ? [{ label: "Children Charges", amount: childrenCharge }] : []),
          { label: "Transportation Cost", amount: transportationCostNum },
          { label: "Extra / Service Cost", amount: otherChargesNum },
          ...customChargeLines,
          { label: "Discount", amount: discountNum },
        ].map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">{row.label}</span>
            <span className="font-medium">{formatCurrency(row.amount)}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 rounded-lg bg-accent px-4 py-3 font-semibold text-accent-foreground">
        <span>Grand Total</span>
        <span className="text-lg">{formatCurrency(total)}</span>
      </div>
    </SummaryCard>
  );

  // A locked quotation keeps every field on screen at full strength but cannot change them (as an order does): a disabled fieldset covers the
  // inputs and buttons, and the pointer rules cover the dropdowns, which are not native controls. The menu builder shows its own read-only plan.
  const freeze = (node: React.ReactNode) =>
    locked ? (
      <fieldset disabled className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0 [&_:disabled]:bg-muted! [&_:disabled]:opacity-100! [&_button]:pointer-events-none [&_[role=combobox]]:pointer-events-none" data-testid="quotation-locked-fields">
        {node}
      </fieldset>
    ) : (
      node
    );

  const tabs: FormTab[] = [
    {
      id: "details",
      label: "Order Details",
      // Customer and guests side by side, the event below them, as on an order.
      panel: (
        <>
          {freeze(
            <>
              <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2 [&>*]:h-full">
                {customerSection}
                {guestSection}
              </div>
              {eventSection}
            </>,
          )}
          {kindDialog}
          {singleAskDialog}
        </>
      ),
    },
    { id: "menu", label: "Build Menu", panel: buildMenuTab },
    ...(showPrices ? [{ id: "pricing", label: "Pricing", panel: freeze(pricingEditorCard) }] : []),
    { id: "additional", label: "Additional Details", panel: freeze(additionalSection) },
  ];

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
            {!locked && (
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : submitLabel}
              </Button>
            )}
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {locked && quotationId && status && <QuotationLockBanner quotationId={quotationId} status={status} />}

        {beforeContent}

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          {/* ---------------- Main column ---------------- */}
          <div className="flex min-w-0 flex-col gap-4">
            <FormTabs tabs={tabs} idPrefix="quote" />
          </div>

          {/* ---------------- Summary column ---------------- */}
          <aside className="flex min-w-0 flex-col gap-4">
            {summaryCard}
            {showPrices && pricingSummaryCard}
          </aside>
        </div>
      </form>
      {afterContent}
    </>
  );
}
