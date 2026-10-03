"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ClipboardList, CreditCard, Info, MapPin, Tag, User, UtensilsCrossed, Users, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconInput } from "@/components/ui/icon-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { PhoneInput } from "@/components/ui/phone-input";
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
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { CustomerCombobox, type SelectedCustomer } from "@/components/customers/customer-combobox";
import { MenuPlanningSection, MEAL_TYPES, type MealSelection, type MenuOption, type MealTypeValue } from "@/components/catalog/menu-planning-section";
import { cn } from "cn";
import { FormSection, SummaryCard, SummaryRow } from "./order-form-parts";
import { FormTabs, type FormTab } from "./form-tabs";
import { priceMeals } from "@/modules/orders/meal-pricing";
import { TONE_SURFACE, TONE_TEXT } from "./order-display";
import { getOrderCountsByDayAction, getMenuForOrderPickerAction, searchCustomersAction, createCustomerForOrderAction, type ActionResult } from "../actions";

// Mirrors actions.ts's own past-date check — a live client-side preview of the
// same server-enforced rule, never the only place it's checked. The team may
// book today and tomorrow; only a date already gone is refused (AJ, 2026-09-27).
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

const PAYMENT_STATUS_OPTIONS = [
  { value: "UNPAID", label: "Unpaid" },
  { value: "PARTIALLY_PAID", label: "Partially Paid" },
  { value: "PAID", label: "Paid" },
] as const;

// Mirrors the customer-facing intake form's own VENUE_TYPE_OPTIONS
// (event-details-form.tsx) exactly — same Order.venueType enum, same labels.
const VEHICLE_ACCESS_OPTIONS = [
  { value: "VEHICLE_AND_PARKING", label: "Vehicle can enter venue & parking available" },
  { value: "VEHICLE_NO_PARKING", label: "Vehicle can enter but no parking" },
  { value: "NO_VEHICLE_ACCESS", label: "Vehicle cannot enter venue" },
  { value: "MANUAL_LOADING_REQUIRED", label: "Manual loading required" },
] as const;

const VENUE_TYPE_OPTIONS = [
  { value: "CLUBHOUSE", label: "Clubhouse" },
  { value: "HOTEL", label: "Hotel" },
  { value: "BANQUET_HALL", label: "Banquet Hall" },
  { value: "RESORT", label: "Resort" },
  { value: "HOME", label: "Home" },
  { value: "OFFICE", label: "Office" },
  { value: "OTHER", label: "Other" },
] as const;

// Reuses Menu's own ChildPricingType enum (PERCENTAGE | FIXED) — "Per Plate"
// is this form's label for FIXED, matching the reference mockup's wording.
const CHILD_PRICING_TYPE_OPTIONS = [
  { value: "FIXED", label: "Per Plate" },
  { value: "PERCENTAGE", label: "Percentage" },
] as const;

export interface OrderFormValues {
  customerId: string;
  eventTypeId: string;
  /** "VEGETARIAN" | "NON_VEGETARIAN" | "" (no preference), as on the public form. */
  menuPreference: string;
  /** SINGLE renders Meal Planning as one continuous event; MULTI groups the same per-day data into "Event 1/Event 2…" blocks. */
  orderKind: string;
  eventStartDate: string;
  eventEndDate: string;
  /** "Venue & Delivery Details" — venue is the Venue/Building Name, eventAddress the Complete Venue Address. */
  venue: string;
  eventAddress: string;
  venueType: string;
  vehicleAccess: string;
  venueAccessInstructions: string;
  venueDoorNumber: string;
  venueTower: string;
  venueFloor: string;
  venueLandmark: string;
  venueContactName: string;
  venueContactPhone: string;
  liveCounterAvailable: boolean;
  gasElectricAvailable: boolean;
  deliveryInstructions: string;
  cookingInstructions: string;
  adultCount: string;
  childBelow5Count: string;
  child5To10Count: string;
  totalParticipants: string;
  /** Order-level, all Order Types — Standard reuses the first assigned meal's own Menu's child rates; Individual overrides with the two rates+types below. */
  pricingMethod: string;
  individualChildBelow5Rate: string;
  individualChildBelow5PricingType: string;
  individualChild5To10Rate: string;
  individualChild5To10PricingType: string;
  individualPricingEnabled: boolean;
  discount: string;
  transportationCost: string;
  otherCharges: string;
  advance: string;
  paymentStatus: string;
  status: string;
  notes: string;
  /** Internal, kitchen-facing — distinct from the customer-facing Notes above. */
  kitchenNotes: string;
  mealPlanEntries: MealSelection[];
}

export const EMPTY_ORDER_VALUES: OrderFormValues = {
  customerId: "",
  eventTypeId: "",
  menuPreference: "",
  orderKind: "SINGLE",
  eventStartDate: "",
  eventEndDate: "",
  venue: "",
  eventAddress: "",
  venueType: "",
  vehicleAccess: "",
  venueAccessInstructions: "",
  venueDoorNumber: "",
  venueTower: "",
  venueFloor: "",
  venueLandmark: "",
  venueContactName: "",
  venueContactPhone: "",
  liveCounterAvailable: false,
  gasElectricAvailable: false,
  deliveryInstructions: "",
  cookingInstructions: "",
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
  discount: "0",
  transportationCost: "0",
  otherCharges: "0",
  advance: "0",
  paymentStatus: "UNPAID",
  status: "PENDING_REVIEW",
  notes: "",
  kitchenNotes: "",
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

/** Mirrors order.ts's server-side computeChildrenCharge exactly (STANDARD). */
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

interface OrderFormProps {
  initialValues?: Partial<OrderFormValues>;
  customers: { id: string; name: string; phone: string; email?: string | null }[];
  eventTypes: { id: string; name: string }[];
  menus: MenuOption[];
  /** Title block (breadcrumb, heading, description) shown top-left; the form owns the top-right actions. */
  header: React.ReactNode;
  /** Extra top-right actions before Cancel / Save (e.g. the detail page's Delete). */
  headerActions?: React.ReactNode;
  /**
   * Tabbed layout (AJ, 2026-09-30) for create and edit alike. The sidebar shows
   * `sidebarTop` (summary, approval, kitchen cards) above a read-only Pricing box;
   * omit it for a live Order Summary built from the form.
   */
  sidebarTop?: React.ReactNode;
  /** Tabbed only: the Inventory tab's content and anything extra for the top of Pricing & Payment. */
  inventoryTab?: React.ReactNode;
  /** The Expenses tab (Chunk 15); only passed on the order's own page and only to roles that may view expenses. */
  expensesTab?: React.ReactNode;
  pricingExtra?: React.ReactNode;
  /**
   * Edit page only (AJ, 2026-09-30): the menu is planned in Menu Approvals, so here it is shown read-only and the
   * form sends no meals (the server leaves the meal plan alone). The banner carries the "Edit Menu" link.
   */
  menuPlanReadOnly?: boolean;
  /** Shown above the read-only planner: the menu approval status and the Edit Menu button. */
  menuPlanBanner?: React.ReactNode;
  cancelHref?: string;
  /**
   * The frozen total of any whole-order items carried over from an accepted
   * Quotation (quotation.ts's convertQuotationToOrder) — this form has no
   * picker for them (see the read-only recap on the Order detail page
   * instead), but the live preview below must still fold them into
   * Subtotal/Total/Balance or it would silently disagree with the actual
   * persisted order. Zero/omitted for every Order created directly.
   */
  carriedOverItemsSubtotal?: number;
  onSubmit: (formData: FormData) => Promise<ActionResult>;
  onSuccess: () => void;
  submitLabel: string;
  /** Group 10.5's "Create & Send WhatsApp" action, alongside the plain submit. */
  onSubmitAndNotify?: (formData: FormData) => Promise<ActionResult>;
}

export function OrderForm({
  initialValues,
  customers,
  eventTypes,
  menus,
  header,
  headerActions,
  sidebarTop,
  inventoryTab,
  expensesTab,
  pricingExtra,
  menuPlanReadOnly = false,
  menuPlanBanner = null,
  cancelHref = "/orders",
  carriedOverItemsSubtotal = 0,
  onSubmit,
  onSuccess,
  submitLabel,
  onSubmitAndNotify,
}: OrderFormProps) {
  const [values, setValues] = useState<OrderFormValues>({ ...EMPTY_ORDER_VALUES, ...initialValues });
  // Edit mode's already-selected Customer, found once from the full list
  // passed down — CustomerCombobox only needs this single row to seed its
  // display text; it does its own server-side search for anything else.
  const initialSelectedCustomer: SelectedCustomer | null = initialValues?.customerId
    ? (customers.find((c) => c.id === initialValues.customerId) ?? null)
    : null;
  // Who is picked right now — feeds the read-only Email / Phone fields and the Order Summary.
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(initialSelectedCustomer);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"save" | "whatsapp" | null>(null);
  // Set when the form itself switched the Order Type to Multi Order, so a popup
  // can say why (AJ, 2026-09-27): a date range, or more than one meal type.
  const [multiNotice, setMultiNotice] = useState<"dates" | "meals" | null>(null);
  // Which meal's "Select/Edit Food Items" drawer is open — lifted here (not
  // internal to MenuPlanningSection) so the "Selected Meals" summary card
  // can also open it directly for any date, not just the sidebar-focused one.
  const [foodDialogTarget, setFoodDialogTarget] = useState<{ date: string; mealType: MealTypeValue } | null>(null);

  // True while Multi was chosen by the form itself (not clicked), so it can flip back to Single on its own.
  const [autoSwitchedToMulti, setAutoSwitchedToMulti] = useState(false);

  function setField<K extends keyof OrderFormValues>(key: K, value: OrderFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function setOrderKind(kind: string) {
    setAutoSwitchedToMulti(false);
    setField("orderKind", kind);
  }

  /**
   * Multi Order is automatic (AJ, 2026-09-27): a date range, or more than one
   * meal type even on a single day, makes it one. The form switches and says
   * why in a popup. A Multi Order can't be turned back to Single while either
   * still holds (see `multiRequired`).
   */
  function autoMulti(reason: "dates" | "meals") {
    setValues((prev) => (prev.orderKind === "MULTI" ? prev : { ...prev, orderKind: "MULTI" }));
    if (values.orderKind !== "MULTI") {
      setMultiNotice(reason);
      setAutoSwitchedToMulti(true);
    }
  }

  /**
   * DateRangePicker's onChange — replaces separate start/end date inputs.
   */
  function setEventDateRange(startDate: string, endDate: string) {
    setField("eventStartDate", startDate);
    setField("eventEndDate", endDate);
    // Shrinking (or moving) the date range must drop meal-plan entries for
    // days no longer in it — otherwise they stay invisible in the UI below
    // but still ride along in buildFormData and get saved anyway.
    const newDays = new Set(enumerateDates(startDate, endDate));
    setField(
      "mealPlanEntries",
      values.mealPlanEntries.filter((e) => newDays.has(e.date)),
    );
    if (startDate && endDate && startDate !== endDate) autoMulti("dates");
  }

  const days = useMemo(() => enumerateDates(values.eventStartDate, values.eventEndDate), [values.eventStartDate, values.eventEndDate]);

  /** Applies a new meal plan and, if it now spans more than one meal type, makes the order a Multi Order. Passed straight into MenuPlanningSection as its onChange. */
  function setMealPlan(entries: MealSelection[]) {
    setField("mealPlanEntries", entries);
    if (new Set(entries.map((e) => e.mealType)).size > 1) autoMulti("meals");
  }

  // One pricing rule everywhere (meal-pricing.ts): a meal costs its Menu's price x guests; only Extra dishes and add-ons move the price.
  const guestsForPricing = (Number(values.adultCount) || 0) + (Number(values.childBelow5Count) || 0) + (Number(values.child5To10Count) || 0);
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
  const subtotal = mealItemsSubtotal + mealsSubtotal + childrenCharge + carriedOverItemsSubtotal;
  const eventDaysUntil = daysUntilPreview(values.eventStartDate);
  // No backdated orders (AJ, 2026-09-27). An existing order keeps its own past date untouched.
  const eventDatePast = eventDaysUntil !== null && eventDaysUntil < 0 && values.eventStartDate !== initialValues?.eventStartDate;
  const distinctMealTypes = new Set(values.mealPlanEntries.map((e) => e.mealType)).size;
  const multiRequired = days.length > 1 || distinctMealTypes > 1;
  // Back to one date and one meal type: undo the automatic switch (AJ, 2026-09-30). A Multi the user picked by hand stays.
  if (autoSwitchedToMulti && !multiRequired) {
    setAutoSwitchedToMulti(false);
    if (values.orderKind === "MULTI") setField("orderKind", "SINGLE");
  }
  const individualOn = values.individualPricingEnabled || values.pricingMethod === "INDIVIDUAL";
  const guestsComputed = (Number(values.adultCount) || 0) + (Number(values.childBelow5Count) || 0) + (Number(values.child5To10Count) || 0);
  const discountNum = Number.parseFloat(values.discount) || 0;
  const transportationCostNum = Number.parseFloat(values.transportationCost) || 0;
  const otherChargesNum = Number.parseFloat(values.otherCharges) || 0;
  const advanceNum = Number.parseFloat(values.advance) || 0;
  // Mirrors order.ts's server-side recalculateOrderTotals exactly.
  const total = subtotal - discountNum + transportationCostNum + otherChargesNum;
  const balance = total - advanceNum;

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
    formData.set("venueType", values.venueType);
    formData.set("vehicleAccess", values.vehicleAccess);
    formData.set("venueAccessInstructions", values.venueAccessInstructions);
    formData.set("venueDoorNumber", values.venueDoorNumber);
    formData.set("venueTower", values.venueTower);
    formData.set("venueFloor", values.venueFloor);
    formData.set("venueLandmark", values.venueLandmark);
    formData.set("venueContactName", values.venueContactName);
    formData.set("venueContactPhone", values.venueContactPhone);
    formData.set("liveCounterAvailable", String(values.liveCounterAvailable));
    formData.set("gasElectricAvailable", String(values.gasElectricAvailable));
    formData.set("deliveryInstructions", values.deliveryInstructions);
    formData.set("cookingInstructions", values.cookingInstructions);
    formData.set("adultCount", values.adultCount);
    formData.set("childBelow5Count", values.childBelow5Count);
    formData.set("child5To10Count", values.child5To10Count);
    formData.set(
      "totalParticipants",
      String((Number(values.adultCount) || 0) + (Number(values.childBelow5Count) || 0) + (Number(values.child5To10Count) || 0)),
    );
    formData.set("pricingMethod", values.pricingMethod);
    formData.set("individualChildBelow5Rate", values.individualChildBelow5Rate);
    formData.set("individualChildBelow5PricingType", values.individualChildBelow5PricingType);
    formData.set("individualChild5To10Rate", values.individualChild5To10Rate);
    formData.set("individualChild5To10PricingType", values.individualChild5To10PricingType);
    formData.set("individualPricingEnabled", String(values.individualPricingEnabled));
    formData.set("discount", values.discount);
    formData.set("transportationCost", values.transportationCost);
    formData.set("otherCharges", values.otherCharges);
    formData.set("advance", values.advance);
    formData.set("paymentStatus", values.paymentStatus);
    formData.set("notes", values.notes);
    formData.set("kitchenNotes", values.kitchenNotes);
    if (menuPlanReadOnly) formData.set("mealPlanLocked", "true");
    for (const entry of menuPlanReadOnly ? [] : values.mealPlanEntries) {
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

  async function handleSubmit(notifyWhatsApp: boolean) {
    setError(null);
    if (!values.customerId) {
      setError("A Customer is required.");
      return;
    }
    if (!values.eventStartDate || !values.eventEndDate) {
      setError("Event Date is required.");
      return;
    }
    if (eventDatePast) {
      setError("Event Date can't be in the past.");
      return;
    }
    const emptyMeal = menuPlanReadOnly ? undefined : values.mealPlanEntries.find((e) => e.menuId && !e.items.some((i) => i.itemType === "MENU_ITEM"));
    if (emptyMeal) {
      const label = MEAL_TYPES.find((m) => m.value === emptyMeal.mealType)?.label ?? "a meal";
      setError(`Select food items for ${label}${days.length > 1 ? ` on ${emptyMeal.date}` : ""}, or remove the meal.`);
      return;
    }
    if (values.paymentStatus === "PARTIALLY_PAID" && advanceNum <= 0) {
      setError("Enter the Advance Payment Amount received so far.");
      return;
    }
    setPending(notifyWhatsApp ? "whatsapp" : "save");

    const submitFn = notifyWhatsApp && onSubmitAndNotify ? onSubmitAndNotify : onSubmit;
    const result = await submitFn(buildFormData());
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSuccess();
  }

  const startsIn = startsInPreview(eventDaysUntil);
  const totalGuests = String(guestsComputed);
  const orderTypeOptions = [
    { value: "SINGLE", label: "Single Order", hint: "One event / one meal type" },
    { value: "MULTI", label: "Multi Order", hint: "Multiple meals across the same event" },
  ] as const;
  const formatDay = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", opts);
  const eventDateText =
    values.eventStartDate && values.eventEndDate
      ? values.eventStartDate === values.eventEndDate
        ? formatDay(values.eventStartDate, { day: "numeric", month: "short", year: "numeric" })
        : `${formatDay(values.eventStartDate, { day: "numeric", month: "short" })} – ${formatDay(values.eventEndDate, { day: "numeric", month: "short", year: "numeric" })}`
      : "Not set";
  const eventTypeName = eventTypes.find((t) => t.id === values.eventTypeId)?.name;

  /** One switch drives both individual-pricing settings the order stores: the per-meal price and the child rates. */
  function setIndividualPricing(on: boolean) {
    setValues((prev) => ({ ...prev, individualPricingEnabled: on, pricingMethod: on ? "INDIVIDUAL" : "STANDARD" }));
  }

  const individualToggle = (
    <label htmlFor="order-individual-pricing" className="flex cursor-pointer items-center gap-2">
      <Switch id="order-individual-pricing" checked={individualOn} onCheckedChange={setIndividualPricing} />
      <span className="text-sm font-medium">Individual Pricing {individualOn ? "On" : "Off"}</span>
    </label>
  );

  const sec = (_n: number, icon: LucideIcon) => ({ icon });

  const customerSection = (
  <FormSection {...sec(1, User)} title="Customer Details" description="Search for an existing customer or add a new one.">
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="order-customer" required>Customer</Label>
      <CustomerCombobox
        id="order-customer"
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
    </div>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-customer-email">Email</Label>
        <Input id="order-customer-email" readOnly tabIndex={-1} className="bg-muted/40" value={selectedCustomer?.email ?? ""} placeholder="Filled in from the customer" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-customer-phone">Phone</Label>
        <PhoneInput id="order-customer-phone" disabled value={selectedCustomer?.phone ?? ""} onChange={() => {}} />
      </div>
    </div>
  </FormSection>
  );

  const orderTypeSection = (
  <FormSection
    {...sec(2, Users)}
    title="Order Type"
    description={
      values.orderKind === "MULTI"
        ? multiRequired
          ? "More than one date or meal type, so this stays a Multi Order."
          : "Meal Planning below groups each date into its own event."
        : "One date and one meal type. Adding a date or another meal makes it a Multi Order."
    }
  >
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {orderTypeOptions.map((option) => {
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
  );

  const eventSection = (
  <FormSection {...sec(3, CalendarDays)} title="Event Information" description="Tell us about the event and where it will take place.">
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-event-type">Event Type</Label>
        <Select
          items={Object.fromEntries(eventTypes.map((t) => [t.id, t.name]))}
          value={values.eventTypeId}
          onValueChange={(v) => setField("eventTypeId", v ?? values.eventTypeId)}
        >
          <SelectTrigger id="order-event-type" className="w-full">
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
        <Label htmlFor="order-event-date" required>Event Date</Label>
        <div className="flex items-stretch gap-2">
          <div className="min-w-0 flex-1">
            <DateRangePicker
              id="order-event-date"
              startDate={values.eventStartDate}
              endDate={values.eventEndDate}
              onChange={setEventDateRange}
              minDate={toLocalIsoDate(new Date())}
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
        {eventDatePast && (
          <p className="text-xs text-destructive" role="alert">
            Event Date can&apos;t be in the past.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-venue-type">Venue Type</Label>
        <Select
          items={Object.fromEntries(VENUE_TYPE_OPTIONS.map((o) => [o.value, o.label]))}
          value={values.venueType}
          onValueChange={(v) => setField("venueType", v ?? "")}
        >
          <SelectTrigger id="order-venue-type" className="w-full">
            <SelectValue placeholder="Select venue type" />
          </SelectTrigger>
          <SelectContent>
            {VENUE_TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-venue">Venue / Building Name</Label>
        <IconInput icon={MapPin} id="order-venue" value={values.venue} onChange={(e) => setField("venue", e.target.value)} />
      </div>

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="order-address">Complete Venue Address</Label>
        <Textarea id="order-address" value={values.eventAddress} onChange={(e) => setField("eventAddress", e.target.value)} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="order-venue-door">Door / Flat / House No.</Label>
          <Input id="order-venue-door" value={values.venueDoorNumber} onChange={(e) => setField("venueDoorNumber", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="order-venue-tower">Tower / Block</Label>
          <Input id="order-venue-tower" value={values.venueTower} onChange={(e) => setField("venueTower", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="order-venue-floor">Floor</Label>
          <Input id="order-venue-floor" value={values.venueFloor} onChange={(e) => setField("venueFloor", e.target.value)} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-venue-landmark">Landmark</Label>
        <Input id="order-venue-landmark" value={values.venueLandmark} onChange={(e) => setField("venueLandmark", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-venue-contact-name">Venue Contact Person</Label>
        <Input id="order-venue-contact-name" value={values.venueContactName} onChange={(e) => setField("venueContactName", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="order-venue-contact-phone">Contact Number</Label>
        <PhoneInput id="order-venue-contact-phone" value={values.venueContactPhone} onChange={(v) => setField("venueContactPhone", v)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-vehicle-access">Vehicle Access</Label>
        <Select
          items={Object.fromEntries(VEHICLE_ACCESS_OPTIONS.map((o) => [o.value, o.label]))}
          value={values.vehicleAccess}
          onValueChange={(v) => setField("vehicleAccess", v ?? values.vehicleAccess)}
        >
          <SelectTrigger id="order-vehicle-access" className="w-full">
            <SelectValue placeholder="Not set" />
          </SelectTrigger>
          <SelectContent>
            {VEHICLE_ACCESS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-access-instructions">Catering Access / Loading Instructions</Label>
        <Textarea id="order-access-instructions" value={values.venueAccessInstructions} onChange={(e) => setField("venueAccessInstructions", e.target.value)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-delivery-instructions">Delivery Instructions</Label>
        <Textarea id="order-delivery-instructions" value={values.deliveryInstructions} onChange={(e) => setField("deliveryInstructions", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-cooking-instructions">Cooking Instructions</Label>
        <Textarea id="order-cooking-instructions" value={values.cookingInstructions} onChange={(e) => setField("cookingInstructions", e.target.value)} />
      </div>

      <label htmlFor="order-live-counter" className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-3">
        <Checkbox
          id="order-live-counter"
          checked={values.liveCounterAvailable}
          onCheckedChange={(checked) => setField("liveCounterAvailable", checked === true)}
        />
        <span className="text-sm font-medium">Cooking / live counter facility available?</span>
      </label>
      <label htmlFor="order-gas-electric" className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-3">
        <Checkbox
          id="order-gas-electric"
          checked={values.gasElectricAvailable}
          onCheckedChange={(checked) => setField("gasElectricAvailable", checked === true)}
        />
        <span className="text-sm font-medium">Gas / electric connection available at venue?</span>
      </label>
    </div>
  </FormSection>
  );

  const guestSection = (
  <FormSection {...sec(4, Users)} title="Guest Information" description="Enter the expected guest count. This will be used for all selected meals.">
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-adults">Adults</Label>
        <Input id="order-adults" type="number" min="0" value={values.adultCount} onChange={(e) => setField("adultCount", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-child-below5">Children (Under 5)</Label>
        <Input
          id="order-child-below5"
          type="number"
          min="0"
          value={values.childBelow5Count}
          onChange={(e) => setField("childBelow5Count", e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-child-5to10">Children (5–10)</Label>
        <Input
          id="order-child-5to10"
          type="number"
          min="0"
          value={values.child5To10Count}
          onChange={(e) => setField("child5To10Count", e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-total-guests">Total Guests</Label>
        <Input id="order-total-guests" readOnly tabIndex={-1} className="bg-muted/40" value={String(guestsComputed)} />
      </div>
    </div>
  </FormSection>
  );

  const menuSection = (
  <FormSection
    {...sec(5, UtensilsCrossed)}
    title="Menu Planning"
    description={menuPlanReadOnly ? "Changes to the menu are made in Menu Approvals, so they are approved before they reach the kitchen." : "Select meals and assign menu items for this event."}
    action={menuPlanReadOnly ? null : individualToggle}
  >
    {menuPlanReadOnly && menuPlanBanner}
    <MenuPlanningSection
      idPrefix="order"
      days={days}
      mealPlanEntries={values.mealPlanEntries}
      onChange={setMealPlan}
      menus={menus}
      menuPreference={values.menuPreference}
      onMenuPreferenceChange={(v) => setField("menuPreference", v)}
      individualPricingEnabled={individualOn}
      guestsForPricing={guestsForPricing}
      loadPickerData={getMenuForOrderPickerAction}
      foodDialogTarget={foodDialogTarget}
      onOpenFoodDialog={(date, mealType) => setFoodDialogTarget({ date, mealType })}
      onCloseFoodDialog={() => setFoodDialogTarget(null)}
      readOnly={menuPlanReadOnly}
    />
  </FormSection>
  );

  const additionalSection = (
  <FormSection {...sec(6, ClipboardList)} title="Additional Details" description="Add any special notes or requirements.">
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-notes">Additional Notes</Label>
        <Textarea id="order-notes" value={values.notes} onChange={(e) => setField("notes", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-kitchen-notes">Kitchen Notes</Label>
        <Textarea id="order-kitchen-notes" value={values.kitchenNotes} onChange={(e) => setField("kitchenNotes", e.target.value)} />
        <p className="text-xs text-muted-foreground">Internal — visible to the kitchen team, not the customer.</p>
      </div>
    </div>
  </FormSection>
  );

  const orderSummaryCard = (
  <SummaryCard icon={User} title="Order Summary">
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
  );

  const pricingEditorCard = (
  <SummaryCard icon={Wallet} title="Pricing Details">
    <p className="text-xs text-muted-foreground">
      {individualOn
        ? "Individual Pricing is on (switch it in Menu Planning). Set your own price for each meal and each child age band. Children can be Per Plate or a Percentage of the first assigned Menu's price."
        : "Meals use their Menu's rates. Children (Under 5) / (5–10) are charged with the child rates of the first Menu assigned in Menu Planning. Turn on Individual Pricing in Menu Planning to set your own."}
    </p>
    {individualOn && (
      <div className="flex flex-col gap-3">
        {/* Each meal's own price is set inline on its card in Menu Planning above, not duplicated here (AJ's reference, 2026-09-29). */}
        {(
          [
            { id: "order-individual-below5", label: "Children (Under 5) price", rate: "individualChildBelow5Rate", type: "individualChildBelow5PricingType" },
            { id: "order-individual-5to10", label: "Children (5–10) price", rate: "individualChild5To10Rate", type: "individualChild5To10PricingType" },
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
        <span className="text-base font-semibold">{formatCurrency(mealItemsSubtotal + mealsSubtotal + carriedOverItemsSubtotal)}</span>
      </div>
      {carriedOverItemsSubtotal > 0 && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Carried over from Quotation</span>
          <span>{formatCurrency(carriedOverItemsSubtotal)}</span>
        </div>
      )}
      {childrenCharge > 0 && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Children Charges</span>
          <span>{formatCurrency(childrenCharge)}</span>
        </div>
      )}
      {(
        [
          { id: "order-transportation-cost", label: "Transportation Cost", key: "transportationCost" },
          { id: "order-other-charges", label: "Extra / Service Cost", key: "otherCharges" },
          { id: "order-discount", label: "Discount", key: "discount" },
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
  </SummaryCard>
  );

  const paymentCard = (
  <SummaryCard icon={CreditCard} title="Payment Details">
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="order-payment-status">Payment Status</Label>
      <Select
        items={Object.fromEntries(PAYMENT_STATUS_OPTIONS.map((o) => [o.value, o.label]))}
        value={values.paymentStatus}
        onValueChange={(v) => setField("paymentStatus", v ?? values.paymentStatus)}
      >
        <SelectTrigger id="order-payment-status" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PAYMENT_STATUS_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
    {values.paymentStatus === "PARTIALLY_PAID" ? (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-advance" required>Advance Payment Amount</Label>
        <Input id="order-advance" type="number" min="0.01" step="0.01" value={values.advance} onChange={(e) => setField("advance", e.target.value)} />
      </div>
    ) : (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-advance">Advance Received</Label>
        <Input id="order-advance" type="number" min="0" step="0.01" value={values.advance} onChange={(e) => setField("advance", e.target.value)} />
      </div>
    )}
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">Balance</span>
      <span className="font-semibold">{formatCurrency(balance)}</span>
    </div>
    <div className="flex items-start gap-2 rounded-lg bg-info/10 p-3 text-xs text-info">
      <Info className="mt-0.5 size-4 shrink-0" />
      <span>Payment details can be updated later from the order page.</span>
    </div>
  </SummaryCard>
  );

  const multiDialog = (
  <AlertDialog open={multiNotice !== null} onOpenChange={(open) => !open && setMultiNotice(null)}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Order Type changed to Multi Order</AlertDialogTitle>
        <AlertDialogDescription>
          {multiNotice === "dates"
            ? "You picked more than one date, so this is now a Multi Order. Menu Planning groups each date into its own event."
            : "You picked more than one meal type, so this is now a Multi Order — even on a single day. Menu Planning groups the meals into their own events."}{" "}
          Your meals, menus and food items are kept.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogAction onClick={() => setMultiNotice(null)}>Got it</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
  );

  const pricingSummaryCard = (
    <SummaryCard icon={Wallet} title="Pricing Details">
      <div className="flex flex-col gap-3 text-sm">
        {[
          { label: "Total Amount", amount: mealItemsSubtotal + mealsSubtotal + carriedOverItemsSubtotal },
          ...(childrenCharge > 0 ? [{ label: "Children Charges", amount: childrenCharge }] : []),
          { label: "Transportation Cost", amount: transportationCostNum },
          { label: "Extra / Service Cost", amount: otherChargesNum },
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

  const tabs: FormTab[] = [
    {
      id: "details",
      label: "Order Details",
      panel: (
        <>
          {customerSection}
          {orderTypeSection}
          {multiDialog}
          {eventSection}
        </>
      ),
    },
    {
      id: "menu",
      label: "Guests & Menu Planning",
      panel: (
        <>
          {guestSection}
          {menuSection}
        </>
      ),
    },
    { id: "additional", label: "Additional Details", panel: additionalSection },
    {
      id: "pricing",
      label: "Pricing & Payment",
      panel: (
        <>
          {pricingExtra}
          {pricingEditorCard}
          {paymentCard}
        </>
      ),
    },
    ...(inventoryTab
      ? [
    {
      id: "inventory",
      label: "Inventory",
      // Its own fields autosave — Enter there must commit the field, not submit the order.
      panel: (
        <div
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.target instanceof HTMLInputElement && e.target.type !== "checkbox") {
              e.preventDefault();
              e.target.blur();
            }
          }}
        >
          {inventoryTab}
        </div>
      ),
    },
        ]
      : []),
    ...(expensesTab ? [{ id: "expenses", label: "Expenses", panel: expensesTab }] : []),
  ];

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit(false);
        }}
        className="flex flex-col gap-6"
      >
        {/* Header: title block on the left, actions on the right */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">{header}</div>
          <div className="flex flex-wrap items-center gap-2">
            {headerActions}
            <Button type="button" variant="outline" render={<Link href={cancelHref} />} nativeButton={false}>
              Cancel
            </Button>
            {onSubmitAndNotify && (
              <Button type="button" variant="outline" disabled={pending !== null} onClick={() => void handleSubmit(true)}>
                {pending === "whatsapp" ? "Sending…" : "Create & Send WhatsApp"}
              </Button>
            )}
            <Button type="submit" disabled={pending !== null}>
              {pending === "save" ? "Saving…" : submitLabel}
            </Button>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          {/* ---------------- Main column ---------------- */}
          <div className="flex min-w-0 flex-col gap-4">
            <FormTabs tabs={tabs} idPrefix="order" />
          </div>

          {/* ---------------- Summary column ---------------- */}
          <aside className="flex min-w-0 flex-col gap-4">
            {sidebarTop ?? orderSummaryCard}
            {pricingSummaryCard}
          </aside>
        </div>
      </form>
    </>
  );
}
