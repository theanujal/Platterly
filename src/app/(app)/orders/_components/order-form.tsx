"use client";

import { useMemo, useState } from "react";
import { MapPin, Trash2, Plus, PenSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconInput } from "@/components/ui/icon-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { PhoneInput } from "@/components/ui/phone-input";
import { Badge } from "@/components/ui/badge";
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
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { CustomerCombobox, type SelectedCustomer } from "./customer-combobox";
import { FoodItemSelectionDialog, type FoodItemSelectionValue } from "./food-item-selection-dialog";
import { cn } from "cn";
import type { ActionResult } from "../actions";

// Mirrors actions.ts's own MIN_DAYS_BEFORE_EVENT/daysUntil/assertEventDateAllowed
// exactly — this is a live client-side preview of the same server-enforced
// rule, never the only place it's checked.
const MIN_DAYS_BEFORE_EVENT = 2;

function daysUntilPreview(iso: string): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const eventDate = new Date(y, m - 1, d);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((eventDate.getTime() - startOfToday.getTime()) / 86_400_000);
}

const MEAL_TYPES = [
  { value: "BREAKFAST", label: "Breakfast" },
  { value: "LUNCH", label: "Lunch" },
  { value: "HITEA", label: "Hi-Tea" },
  { value: "DINNER", label: "Dinner" },
  { value: "OTHER", label: "Other" },
] as const;

const ORDER_STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "IN_PREPARATION", label: "In Preparation" },
  { value: "READY", label: "Ready" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

const PAYMENT_STATUS_OPTIONS = [
  { value: "UNPAID", label: "Unpaid" },
  { value: "PARTIALLY_PAID", label: "Partially Paid" },
  { value: "PAID", label: "Paid" },
] as const;

// Mirrors the customer-facing intake form's own VENUE_TYPE_OPTIONS
// (event-details-form.tsx) exactly — same Order.venueType enum, same labels.
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

interface MenuOption {
  id: string;
  name: string;
  price: number;
  childUnder5Chargeable: boolean;
  childUnder5Price: number | null;
  child5To10PricingType: "PERCENTAGE" | "FIXED";
  child5To10PriceValue: number | null;
}

interface MealPlanItemRow {
  key: string;
  catalogId: string;
  name: string;
  unitPrice: number;
}

interface MealSelection {
  date: string;
  mealType: (typeof MEAL_TYPES)[number]["value"];
  price: string;
  /** Required before food items can be picked — every meal assigns its own Menu, regardless of Order Type. */
  menuId: string;
  /** Items chosen from that meal's own Menu. */
  items: MealPlanItemRow[];
}

export interface OrderFormValues {
  customerId: string;
  eventTypeId: string;
  /** SINGLE renders Meal Planning as one continuous event; MULTI groups the same per-day data into "Event 1/Event 2…" blocks. */
  orderKind: string;
  eventStartDate: string;
  eventEndDate: string;
  /** "Venue & Delivery Details" — venue is the Venue/Building Name, eventAddress the Complete Venue Address. */
  venue: string;
  eventAddress: string;
  venueType: string;
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
  orderKind: "SINGLE",
  eventStartDate: "",
  eventEndDate: "",
  venue: "",
  eventAddress: "",
  venueType: "",
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
  status: "DRAFT",
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
  customers: { id: string; name: string; phone: string }[];
  eventTypes: { id: string; name: string }[];
  menus: MenuOption[];
  showStatus?: boolean;
  /**
   * The frozen total of any whole-order items carried over from an accepted
   * Quotation (quotation.ts's convertQuotationToOrder) — this form has no
   * picker for them (see the read-only recap on the Order detail page
   * instead), but the live preview below must still fold them into
   * Subtotal/Total/Balance or it would silently disagree with the actual
   * persisted order. Zero/omitted for every Order created directly.
   */
  carriedOverItemsSubtotal?: number;
  /** Owner — lets the <2-days-before-event validation below be overridden instead of blocking submission. */
  canBypassDateRestriction: boolean;
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
  showStatus,
  carriedOverItemsSubtotal = 0,
  canBypassDateRestriction,
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
  // Smart default (Order Type toggle): stops re-applying the moment the
  // admin manually picks Single/Multi, or immediately when editing an
  // existing order (its orderKind is already an explicit, saved choice).
  const [orderKindTouched, setOrderKindTouched] = useState(() => initialValues?.orderKind !== undefined);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"save" | "whatsapp" | null>(null);
  // Single -> Multi needs an explicit confirmation — this changes how the
  // page groups the same Meal Planning data (one continuous event vs.
  // separate "Event N" blocks), so it must never happen from a single click
  // or an incidental multi-day date pick alone. Multi -> Single has no such
  // gate.
  const [showMultiConfirm, setShowMultiConfirm] = useState(false);
  // Which meal's "Select Food Items" dialog is open — a single shared
  // dialog instance rather than one per meal card.
  const [foodDialogTarget, setFoodDialogTarget] = useState<{ date: string; mealType: (typeof MEAL_TYPES)[number]["value"] } | null>(null);

  function setField<K extends keyof OrderFormValues>(key: K, value: OrderFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function setOrderKind(kind: string) {
    setOrderKindTouched(true);
    setField("orderKind", kind);
  }

  /** Order Type toggle's onClick — gates Single -> Multi behind confirmation; every other transition (including Multi -> Single) applies immediately. */
  function requestOrderKind(kind: string) {
    if (kind === "MULTI" && values.orderKind !== "MULTI") {
      setShowMultiConfirm(true);
      return;
    }
    setOrderKind(kind);
  }

  /**
   * DateRangePicker's onChange — replaces separate start/end date inputs.
   * The smart Single/Multi default still applies while untouched, routing
   * through the same confirmation dialog the Order Type buttons use.
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
    if (!orderKindTouched && startDate && endDate && startDate !== endDate && values.orderKind !== "MULTI") {
      setShowMultiConfirm(true);
    }
  }

  const days = useMemo(() => enumerateDates(values.eventStartDate, values.eventEndDate), [values.eventStartDate, values.eventEndDate]);

  const mealMap = useMemo(() => {
    const map = new Map<string, MealSelection>();
    for (const entry of values.mealPlanEntries) map.set(`${entry.date}|${entry.mealType}`, entry);
    return map;
  }, [values.mealPlanEntries]);

  const totalMealSlots = values.mealPlanEntries.length;
  const mealSlotsWithMenu = values.mealPlanEntries.filter((e) => e.menuId).length;
  const mealSlotsPendingMenu = totalMealSlots - mealSlotsWithMenu;
  const totalMealItemsSelected = values.mealPlanEntries.reduce((sum, e) => sum + e.items.length, 0);
  const mealTypeCounts = MEAL_TYPES.map((mt) => ({
    label: mt.label,
    count: values.mealPlanEntries.filter((e) => e.mealType === mt.value).length,
  })).filter((mt) => mt.count > 0);

  function toggleMeal(date: string, mealType: (typeof MEAL_TYPES)[number]["value"], checked: boolean) {
    setField(
      "mealPlanEntries",
      checked
        ? [...values.mealPlanEntries, { date, mealType, price: "", menuId: "", items: [] }]
        : values.mealPlanEntries.filter((e) => !(e.date === date && e.mealType === mealType)),
    );
  }

  function setMealPrice(date: string, mealType: (typeof MEAL_TYPES)[number]["value"], price: string) {
    setField(
      "mealPlanEntries",
      values.mealPlanEntries.map((e) => (e.date === date && e.mealType === mealType ? { ...e, price } : e)),
    );
  }

  function bulkSelect(mealType: (typeof MEAL_TYPES)[number]["value"]) {
    const withoutThisMeal = values.mealPlanEntries.filter((e) => e.mealType !== mealType);
    const additions = days.map((date) => ({ date, mealType, price: "", menuId: "", items: [] }));
    setField("mealPlanEntries", [...withoutThisMeal, ...additions]);
  }

  /** Changing a slot's Menu invalidates whatever was chosen from the old one. */
  function setMealMenu(date: string, mealType: (typeof MEAL_TYPES)[number]["value"], menuId: string) {
    setField(
      "mealPlanEntries",
      values.mealPlanEntries.map((e) => (e.date === date && e.mealType === mealType ? { ...e, menuId, items: [] } : e)),
    );
  }

  /** Food item dialog's card click — a plain toggle, no quantity entry: picking an item always means "one of these," picking it again removes it. */
  function toggleMealItem(date: string, mealType: (typeof MEAL_TYPES)[number]["value"], option: FoodItemSelectionValue) {
    setField(
      "mealPlanEntries",
      values.mealPlanEntries.map((e) => {
        if (e.date !== date || e.mealType !== mealType) return e;
        const alreadySelected = e.items.some((i) => i.catalogId === option.id);
        return {
          ...e,
          items: alreadySelected
            ? e.items.filter((i) => i.catalogId !== option.id)
            : [...e.items, { key: crypto.randomUUID(), catalogId: option.id, name: option.name, unitPrice: option.price }],
        };
      }),
    );
  }

  /** Chip-list "x" — removes by row key rather than re-deriving the catalog option. */
  function removeMealItem(date: string, mealType: (typeof MEAL_TYPES)[number]["value"], itemKey: string) {
    setField(
      "mealPlanEntries",
      values.mealPlanEntries.map((e) =>
        e.date === date && e.mealType === mealType ? { ...e, items: e.items.filter((i) => i.key !== itemKey) } : e,
      ),
    );
  }

  const mealItemsSubtotal = values.mealPlanEntries.reduce((sum, e) => sum + e.items.reduce((s, item) => s + item.unitPrice, 0), 0);
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
  const subtotal = mealItemsSubtotal + mealsSubtotal + childrenCharge + carriedOverItemsSubtotal;
  const eventDaysUntil = daysUntilPreview(values.eventStartDate);
  const eventDateRestricted = eventDaysUntil !== null && eventDaysUntil < MIN_DAYS_BEFORE_EVENT;
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
    formData.set("orderKind", values.orderKind);
    formData.set("eventStartDate", values.eventStartDate);
    formData.set("eventEndDate", values.eventEndDate);
    formData.set("venue", values.venue);
    formData.set("eventAddress", values.eventAddress);
    formData.set("venueType", values.venueType);
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
      values.totalParticipants ||
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
    if (showStatus) formData.set("status", values.status);
    formData.set("notes", values.notes);
    formData.set("kitchenNotes", values.kitchenNotes);
    for (const entry of values.mealPlanEntries) {
      formData.append("mealDate", entry.date);
      formData.append("mealType", entry.mealType);
      formData.append("mealPrice", entry.price || "0");
      formData.append("mealMenuId", entry.menuId || "");
      formData.append(
        "mealItems",
        JSON.stringify(entry.items.map(({ catalogId }) => ({ itemType: "MENU_ITEM", catalogId, quantity: 1 }))),
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
    if (eventDateRestricted && !canBypassDateRestriction) {
      setError(`Orders can't normally be created less than ${MIN_DAYS_BEFORE_EVENT} days before the event. Ask an Owner to create this one.`);
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

  // Renders one date's "Select Meal" checkboxes + the resulting meal cards —
  // shared between Single Order's flat list and Multi Order's per-"Event"
  // grouping below, so the two never drift into two implementations.
  function renderDayMeals(date: string) {
    const selectedMeals = MEAL_TYPES.filter((m) => mealMap.has(`${date}|${m.value}`));
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-3">
          {MEAL_TYPES.map((meal) => {
            const key = `${date}|${meal.value}`;
            const checked = mealMap.has(key);
            return (
              <label key={meal.value} htmlFor={`meal-${date}-${meal.value}`} className="flex cursor-pointer items-center gap-1.5">
                <Checkbox id={`meal-${date}-${meal.value}`} checked={checked} onCheckedChange={(c) => toggleMeal(date, meal.value, c === true)} />
                <span className="text-sm">{meal.label}</span>
              </label>
            );
          })}
        </div>

        {selectedMeals.length > 0 && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {selectedMeals.map((meal) => {
              const key = `${date}|${meal.value}`;
              const entry = mealMap.get(key)!;
              const assignedMenu = menus.find((m) => m.id === entry.menuId);
              const status = !entry.menuId
                ? { label: "Menu not assigned", variant: "warning" as const }
                : entry.items.length === 0
                  ? { label: "Food selection required", variant: "neutral" as const }
                  : { label: `${entry.items.length} item${entry.items.length === 1 ? "" : "s"} selected`, variant: "success" as const };
              return (
                <div key={meal.value} data-testid={`meal-slot-${date}-${meal.value}`} className="flex flex-col gap-2.5 rounded-lg border border-border bg-card p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{meal.label}</span>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`meal-menu-${date}-${meal.value}`} required className="text-xs">
                      Menu
                    </Label>
                    <Select
                      items={Object.fromEntries(menus.map((m) => [m.id, m.name]))}
                      value={entry.menuId}
                      onValueChange={(v) => setMealMenu(date, meal.value, v ?? "")}
                    >
                      <SelectTrigger id={`meal-menu-${date}-${meal.value}`} className="w-full">
                        <SelectValue placeholder="Select Menu" />
                      </SelectTrigger>
                      <SelectContent>
                        {menus.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {entry.menuId && (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">
                          {entry.items.length === 0 ? "No food items selected" : `Food Items — ${entry.items.length} selected`}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setFoodDialogTarget({ date, mealType: meal.value })}
                        >
                          {entry.items.length === 0 ? <Plus className="size-3.5" /> : <PenSquare className="size-3.5" />}
                          {entry.items.length === 0 ? "Select Food Items" : "Edit Food Items"}
                        </Button>
                      </div>
                      {entry.items.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {entry.items.map((item) => (
                            <Badge key={item.key} variant="outline" className="gap-1 pr-1">
                              {item.name}
                              <button
                                type="button"
                                aria-label={`Remove ${item.name}`}
                                onClick={() => removeMealItem(date, meal.value, item.key)}
                                className="rounded-full p-0.5 hover:bg-muted"
                              >
                                <Trash2 className="size-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {values.individualPricingEnabled && (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`meal-price-${date}-${meal.value}`} className="text-xs">
                        Price for this meal
                      </Label>
                      <Input
                        id={`meal-price-${date}-${meal.value}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={entry.price}
                        onChange={(e) => setMealPrice(date, meal.value, e.target.value)}
                      />
                    </div>
                  )}

                  {assignedMenu && (
                    <span className="text-xs text-muted-foreground">₹{assignedMenu.price.toFixed(2)}/plate</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const foodDialogEntry = foodDialogTarget ? mealMap.get(`${foodDialogTarget.date}|${foodDialogTarget.mealType}`) : undefined;
  const foodDialogMenu = foodDialogEntry ? menus.find((m) => m.id === foodDialogEntry.menuId) : undefined;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void handleSubmit(false);
      }}
      className="flex max-w-4xl flex-col gap-8"
    >
      {/* Customer */}
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Customer</h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="order-customer" required>Customer</Label>
          <CustomerCombobox
            initialCustomer={initialSelectedCustomer}
            onSelect={(customer) => setField("customerId", customer.id)}
            onClear={() => setField("customerId", "")}
          />
        </div>
      </section>

      {/* Order Type */}
      <section className="flex flex-col gap-3 border-t border-border pt-6">
        <div>
          <h2 className="text-base font-semibold">Order Type</h2>
          <p className="text-sm text-muted-foreground">
            {values.orderKind === "MULTI"
              ? "Meal Planning below groups each date into its own event."
              : "One continuous event — meals across the date range are planned together."}
          </p>
        </div>
        <div className="flex w-fit gap-1 rounded-lg border border-input p-0.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn("h-10 gap-1.5 px-4 text-sm", values.orderKind === "SINGLE" && "bg-gray-900 text-white hover:bg-gray-900/90")}
            aria-pressed={values.orderKind === "SINGLE"}
            onClick={() => requestOrderKind("SINGLE")}
          >
            Single Order
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn("h-10 gap-1.5 px-4 text-sm", values.orderKind === "MULTI" && "bg-gray-900 text-white hover:bg-gray-900/90")}
            aria-pressed={values.orderKind === "MULTI"}
            onClick={() => requestOrderKind("MULTI")}
          >
            Multi Order
          </Button>
        </div>
      </section>

      <AlertDialog
        open={showMultiConfirm}
        onOpenChange={(open) => {
          setShowMultiConfirm(open);
          // Closing without confirming (Cancel, Escape, outside click) means
          // "stay on the current Order Type" — mark touched so the smart
          // default (setEventDateRange) doesn't keep re-prompting for the
          // same already-declined date range.
          if (!open) setOrderKindTouched(true);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch to Multi Order?</AlertDialogTitle>
            <AlertDialogDescription>
              Multi Order groups Meal Planning below into a separate block per date — Event 1, Event 2, and so on — instead of one continuous
              event. Your meals, menus, and food items already chosen are kept, just regrouped visually.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setOrderKind("MULTI");
                setShowMultiConfirm(false);
              }}
            >
              Switch to Multi Order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Event Information */}
      <section className="flex flex-col gap-3 border-t border-border pt-6">
        <div>
          <h2 className="text-base font-semibold">Event Information</h2>
          <p className="text-sm text-muted-foreground">Configure the event type and date.</p>
        </div>
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
            <DateRangePicker
              id="order-event-date"
              startDate={values.eventStartDate}
              endDate={values.eventEndDate}
              onChange={setEventDateRange}
            />
            {eventDateRestricted && (
              <p className={`text-xs ${canBypassDateRestriction ? "text-warning" : "text-destructive"}`} role={canBypassDateRestriction ? undefined : "alert"}>
                {canBypassDateRestriction
                  ? `This event is less than ${MIN_DAYS_BEFORE_EVENT} days away — you can still create this order as an Owner.`
                  : `Orders can't normally be created less than ${MIN_DAYS_BEFORE_EVENT} days before the event. Ask an Owner to create this one.`}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Guests Information */}
      <section className="flex flex-col gap-3 border-t border-border pt-6">
        <div>
          <h2 className="text-base font-semibold">Guests Information</h2>
          <p className="text-sm text-muted-foreground">Guest counts — pricing for children appears once you enter a count.</p>
        </div>
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
            {values.pricingMethod === "INDIVIDUAL" && Number(values.childBelow5Count) > 0 && (
              <div className="flex flex-col gap-1.5 rounded-md bg-muted/40 p-2">
                <Label htmlFor="order-individual-below5-rate" className="text-xs">
                  Pricing
                </Label>
                <div className="flex gap-1.5">
                  <Input
                    id="order-individual-below5-rate"
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-20"
                    value={values.individualChildBelow5Rate}
                    onChange={(e) => setField("individualChildBelow5Rate", e.target.value)}
                  />
                  <Select
                    items={Object.fromEntries(CHILD_PRICING_TYPE_OPTIONS.map((o) => [o.value, o.label]))}
                    value={values.individualChildBelow5PricingType}
                    onValueChange={(v) => setField("individualChildBelow5PricingType", v ?? values.individualChildBelow5PricingType)}
                  >
                    <SelectTrigger className="flex-1">
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
            )}
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
            {values.pricingMethod === "INDIVIDUAL" && Number(values.child5To10Count) > 0 && (
              <div className="flex flex-col gap-1.5 rounded-md bg-muted/40 p-2">
                <Label htmlFor="order-individual-5to10-rate" className="text-xs">
                  Pricing
                </Label>
                <div className="flex gap-1.5">
                  <Input
                    id="order-individual-5to10-rate"
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-20"
                    value={values.individualChild5To10Rate}
                    onChange={(e) => setField("individualChild5To10Rate", e.target.value)}
                  />
                  <Select
                    items={Object.fromEntries(CHILD_PRICING_TYPE_OPTIONS.map((o) => [o.value, o.label]))}
                    value={values.individualChild5To10PricingType}
                    onValueChange={(v) => setField("individualChild5To10PricingType", v ?? values.individualChild5To10PricingType)}
                  >
                    <SelectTrigger className="flex-1">
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
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="order-total-guests">Total Guests</Label>
            <Input
              id="order-total-guests"
              type="number"
              min="0"
              placeholder={String(
                (Number(values.adultCount) || 0) + (Number(values.childBelow5Count) || 0) + (Number(values.child5To10Count) || 0),
              )}
              value={values.totalParticipants}
              onChange={(e) => setField("totalParticipants", e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* Pricing Information */}
      <section className="flex flex-col gap-3 border-t border-border pt-6">
        <div>
          <h2 className="text-base font-semibold">Pricing Information</h2>
          <p className="text-sm text-muted-foreground">Choose how meals and menu items in Meal Planning below are priced.</p>
        </div>
        <div className="flex w-fit gap-1 rounded-lg border border-input p-0.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn("h-10 gap-1.5 px-4 text-sm", values.pricingMethod === "STANDARD" && "bg-gray-900 text-white hover:bg-gray-900/90")}
            aria-pressed={values.pricingMethod === "STANDARD"}
            onClick={() => setField("pricingMethod", "STANDARD")}
          >
            Standard Menu Rates
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn("h-10 gap-1.5 px-4 text-sm", values.pricingMethod === "INDIVIDUAL" && "bg-gray-900 text-white hover:bg-gray-900/90")}
            aria-pressed={values.pricingMethod === "INDIVIDUAL"}
            onClick={() => setField("pricingMethod", "INDIVIDUAL")}
          >
            Individual Pricing
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {values.pricingMethod === "STANDARD"
            ? "Children (Under 5) / (5–10) counts above are charged using the child rates of the first Menu assigned in Meal Planning below."
            : "Set a custom rate for each child age band above — Per Plate or a Percentage of the first assigned Menu's price."}
        </p>
      </section>

      {/* Meal Planning */}
      <section className="flex flex-col gap-3 border-t border-border pt-6">
        <div>
          <h2 className="text-base font-semibold">Meal Planning</h2>
          <p className="text-sm text-muted-foreground">Select each meal, assign its menu, then pick food items from that menu.</p>
        </div>
        <label htmlFor="order-individual-pricing" className="flex w-fit cursor-pointer items-center gap-2">
          <Checkbox
            id="order-individual-pricing"
            checked={values.individualPricingEnabled}
            onCheckedChange={(checked) => setField("individualPricingEnabled", checked === true)}
          />
          <span className="text-sm font-medium">Set a custom price per meal</span>
        </label>
        {days.length === 0 ? (
          <p className="text-sm text-muted-foreground">Set the Event Date above to start planning meals.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {(["BREAKFAST", "LUNCH", "DINNER"] as const).map((mealType) => (
                <Button key={mealType} type="button" variant="outline" size="sm" onClick={() => bulkSelect(mealType)}>
                  All {MEAL_TYPES.find((m) => m.value === mealType)!.label}
                </Button>
              ))}
            </div>

            {values.orderKind === "MULTI" ? (
              <div className="flex flex-col gap-4">
                {days.map((date, index) => (
                  <div key={date} className="flex flex-col gap-3 rounded-xl border border-border p-4">
                    <div className="flex items-center gap-2">
                      <Badge variant="info">Event {index + 1}</Badge>
                      <span className="text-sm font-medium">
                        {new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                      </span>
                    </div>
                    {renderDayMeals(date)}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-4 rounded-xl border border-border p-4">
                {days.map((date) => (
                  <div key={date} className="flex flex-col gap-3 border-b border-border/60 pb-4 last:border-0 last:pb-0">
                    <span className="text-sm font-medium">
                      {new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                    </span>
                    {renderDayMeals(date)}
                  </div>
                ))}
              </div>
            )}

            {/* Meal Summary — quick read on how much of the plan is actually finished. */}
            <div className="flex flex-wrap gap-4 rounded-md border border-border bg-muted/30 p-3 text-sm">
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">Total Meals</span>
                <span className="font-medium">{totalMealSlots}</span>
              </div>
              {mealTypeCounts.map((mt) => (
                <div key={mt.label} className="flex flex-col">
                  <span className="text-xs text-muted-foreground">{mt.label}</span>
                  <span className="font-medium">{mt.count}</span>
                </div>
              ))}
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">Menu assigned</span>
                <span className="font-medium">{mealSlotsWithMenu} / {totalMealSlots}</span>
              </div>
              {mealSlotsPendingMenu > 0 && (
                <div className="flex flex-col">
                  <span className="text-xs text-warning">Pending Menu</span>
                  <span className="font-medium text-warning">{mealSlotsPendingMenu}</span>
                </div>
              )}
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">Food items selected</span>
                <span className="font-medium">{totalMealItemsSelected}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">Meal items subtotal</span>
                <span className="font-medium">{formatCurrency(mealItemsSubtotal)}</span>
              </div>
            </div>
          </div>
        )}
      </section>

      {foodDialogTarget && foodDialogEntry && foodDialogMenu && (
        <FoodItemSelectionDialog
          open
          onOpenChange={(open) => !open && setFoodDialogTarget(null)}
          menuId={foodDialogMenu.id}
          menuName={foodDialogMenu.name}
          selectedIds={new Set(foodDialogEntry.items.map((i) => i.catalogId))}
          onToggle={(item) => toggleMealItem(foodDialogTarget.date, foodDialogTarget.mealType, item)}
        />
      )}

      {/* Venue & Delivery Details */}
      <section className="flex flex-col gap-3 border-t border-border pt-6">
        <div>
          <h2 className="text-base font-semibold">Venue &amp; Delivery Details</h2>
          <p className="text-sm text-muted-foreground">Where the event happens and any special instructions for delivery/cooking.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-4">
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
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="order-venue-landmark">Landmark</Label>
              <Input id="order-venue-landmark" value={values.venueLandmark} onChange={(e) => setField("venueLandmark", e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="order-address">Complete Venue Address</Label>
            <Textarea id="order-address" className="h-full min-h-32" value={values.eventAddress} onChange={(e) => setField("eventAddress", e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="order-venue-contact-name">Venue Contact Person</Label>
            <Input id="order-venue-contact-name" value={values.venueContactName} onChange={(e) => setField("venueContactName", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="order-venue-contact-phone">Contact Number</Label>
            <PhoneInput id="order-venue-contact-phone" value={values.venueContactPhone} onChange={(v) => setField("venueContactPhone", v)} />
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
      </section>

      {/* Order Details */}
      <section className="flex flex-col gap-3 border-t border-border pt-6">
        <div>
          <h2 className="text-base font-semibold">Order Details</h2>
          <p className="text-sm text-muted-foreground">A recap of what&apos;s been planned above, plus any additional charges.</p>
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-muted/30 p-3 text-sm sm:grid-cols-4">
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Event Date</span>
            <span className="font-medium">
              {values.eventStartDate && values.eventEndDate
                ? values.eventStartDate === values.eventEndDate
                  ? new Date(`${values.eventStartDate}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                  : `${new Date(`${values.eventStartDate}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${new Date(`${values.eventEndDate}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
                : "Not set"}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Total Guests</span>
            <span className="font-medium">
              {values.totalParticipants ||
                String((Number(values.adultCount) || 0) + (Number(values.childBelow5Count) || 0) + (Number(values.child5To10Count) || 0))}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Meals Planned</span>
            <span className="font-medium">{totalMealSlots}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Menus &amp; Items</span>
            <span className="font-medium">{totalMealItemsSelected}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {showStatus && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="order-status">Status</Label>
              <Select
                items={Object.fromEntries(ORDER_STATUS_OPTIONS.map((o) => [o.value, o.label]))}
                value={values.status}
                onValueChange={(v) => setField("status", v ?? values.status)}
              >
                <SelectTrigger id="order-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORDER_STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="order-discount">Discount</Label>
            <Input id="order-discount" type="number" min="0" step="0.01" value={values.discount} onChange={(e) => setField("discount", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="order-transportation-cost">Transportation Cost</Label>
            <Input
              id="order-transportation-cost"
              type="number"
              min="0"
              step="0.01"
              value={values.transportationCost}
              onChange={(e) => setField("transportationCost", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="order-other-charges">Extra / Service Cost</Label>
            <Input
              id="order-other-charges"
              type="number"
              min="0"
              step="0.01"
              value={values.otherCharges}
              onChange={(e) => setField("otherCharges", e.target.value)}
            />
          </div>
          <div className="col-span-full flex flex-col gap-1.5">
            <Label htmlFor="order-notes">Additional Notes</Label>
            <Textarea id="order-notes" value={values.notes} onChange={(e) => setField("notes", e.target.value)} />
          </div>
          <div className="col-span-full flex flex-col gap-1.5">
            <Label htmlFor="order-kitchen-notes">Kitchen Notes</Label>
            <Textarea id="order-kitchen-notes" value={values.kitchenNotes} onChange={(e) => setField("kitchenNotes", e.target.value)} />
            <p className="text-xs text-muted-foreground">Internal — visible to the kitchen team, not the customer.</p>
          </div>
        </div>
      </section>

      {/* Payment Status */}
      <section className="flex flex-col gap-3 border-t border-border pt-6">
        <div>
          <h2 className="text-base font-semibold">Payment Status</h2>
        </div>
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
      </section>

      {/* Order Calculation — live preview, mirrors recalculateOrderTotals server-side */}
      <section className="flex flex-col gap-1.5 rounded-md border border-border bg-muted/30 p-4 text-sm sm:max-w-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(mealItemsSubtotal + mealsSubtotal + carriedOverItemsSubtotal)}</span></div>
        {carriedOverItemsSubtotal > 0 && (
          <div className="flex justify-between"><span className="text-muted-foreground">Carried over from Quotation</span><span>{formatCurrency(carriedOverItemsSubtotal)}</span></div>
        )}
        {childrenCharge > 0 && (
          <div className="flex justify-between"><span className="text-muted-foreground">Children Charges</span><span>{formatCurrency(childrenCharge)}</span></div>
        )}
        <div className="flex justify-between"><span className="text-muted-foreground">Transportation Cost</span><span>+{formatCurrency(transportationCostNum)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Extra / Service Cost</span><span>+{formatCurrency(otherChargesNum)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>-{formatCurrency(discountNum)}</span></div>
        <div className="flex justify-between border-t border-border pt-1.5 font-semibold"><span>Total</span><span>{formatCurrency(total)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Advance</span><span>-{formatCurrency(advanceNum)}</span></div>
        <div className="flex justify-between font-semibold"><span>Balance</span><span>{formatCurrency(balance)}</span></div>
      </section>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending !== null}>
          {pending === "save" ? "Saving…" : submitLabel}
        </Button>
        {onSubmitAndNotify && (
          <Button type="button" variant="outline" disabled={pending !== null} onClick={() => void handleSubmit(true)}>
            {pending === "whatsapp" ? "Sending…" : "Create & Send WhatsApp"}
          </Button>
        )}
      </div>
    </form>
  );
}
