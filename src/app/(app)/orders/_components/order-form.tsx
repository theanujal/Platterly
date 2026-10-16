"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, Lock, ClipboardList, MapPin, Pencil, Plus, Tag, User, UtensilsCrossed, Users, Wallet, X } from "lucide-react";
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
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { CustomerCombobox, type SelectedCustomer } from "@/components/customers/customer-combobox";
import { MenuPlanningSection, MEAL_TYPES, type MealSelection, type MenuOption, type MealTypeValue } from "@/components/catalog/menu-planning-section";
import { DraftPaymentsPanel } from "./draft-payments-panel";
import type { StagedPaymentDraft } from "../../invoices/_components/payments-panel";
import { useUnsavedChangesGuard } from "@/components/unsaved-changes-guard";
import { cn } from "cn";
import { FormSection, SummaryCard, SummaryRow } from "./order-form-parts";
import { FormTabs, type FormTab } from "./form-tabs";
import { priceMeals } from "@/modules/orders/meal-pricing";
import { percentOf } from "@/modules/orders/amount";
import { ApprovalSidebarSlotProvider } from "@/modules/menu-approvals/_components/review/sidebar-slot";
import { LiveOrderTotalProvider, OrderPriceLinesProvider, type OrderPriceLine } from "@/modules/orders/live-total";
import { MAX_CUSTOM_CHARGES, parseCustomCharges, resolveCustomCharges, sumCustomCharges } from "@/modules/orders/custom-charges";
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
  /** Discount and Extra / Service Cost: a rupee amount, or (mode PERCENTAGE) a percentage of the subtotal. Either way the typed number lives in `discount` / `otherCharges`. */
  discount: string;
  discountMode: "FIXED" | "PERCENTAGE";
  transportationCost: string;
  transportationMode: "FIXED" | "PERCENTAGE";
  otherCharges: string;
  otherChargesMode: "FIXED" | "PERCENTAGE";
  /** Team-added label + amount lines (amount typed as text, like the other money fields). */
  customCharges: { label: string; amount: string; mode: "FIXED" | "PERCENTAGE" }[];
  status: string;
  notes: string;
  /** Internal, kitchen-facing — distinct from the customer-facing Notes above. */
  kitchenNotes: string;
  staffingNotes: string;
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
  discountMode: "FIXED",
  transportationCost: "0",
  transportationMode: "FIXED",
  otherCharges: "0",
  otherChargesMode: "FIXED",
  customCharges: [],
  status: "PENDING_REVIEW",
  notes: "",
  kitchenNotes: "",
  staffingNotes: "",
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

/** One typed charge line as the shared parser reads it: a percentage line carries its rate, a rupee line its amount. */
function customChargeInput(c: { label: string; amount: string; mode: "FIXED" | "PERCENTAGE" }) {
  const typed = Number.parseFloat(c.amount);
  return c.mode === "PERCENTAGE" ? { label: c.label, mode: c.mode, rate: typed, amount: 0 } : { label: c.label, amount: typed };
}

/** The fields the Event Information card edits, kept so Cancel can put them back. */
const EVENT_FIELDS = [
  "orderKind", "eventTypeId", "eventStartDate", "eventEndDate", "mealPlanEntries", "venueType", "venue", "eventAddress", "venueDoorNumber", "venueTower", "venueFloor",
  "venueLandmark", "venueContactName", "venueContactPhone", "vehicleAccess", "venueAccessInstructions", "deliveryInstructions", "cookingInstructions",
  "liveCounterAvailable", "gasElectricAvailable",
] as const;

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
  /** Order detail only: the Order Status card, shown in the Order Details tab under Order Type. Outside the locked fieldset, because the status can still be changed by hand. */
  statusCard?: React.ReactNode;
  /** Order detail only: further cards (menu approval, kitchen assignment) at the foot of the Order Details tab. */
  detailsExtra?: React.ReactNode;
  /** Tabbed only: the Inventory tab's content and anything extra for the top of Pricing & Payment. */
  inventoryTab?: React.ReactNode;
  /** The Expenses tab (Chunk 15); only passed on the order's own page and only to roles that may view expenses. */
  expensesTab?: React.ReactNode;
  /** The Staffing tab (Chunk 19.2): who is on this order's event. Only on the order's own page. */
  staffingTab?: React.ReactNode;
  pricingExtra?: React.ReactNode;
  /** Order detail only: the payment summary and the payments list, shown beside the pricing editor in the Pricing & Payment tab. */
  billingPanel?: React.ReactNode;
  /** Order detail only: the Create / Open Invoice button, shown in the sidebar above Order Status while the Pricing & Payment tab is open (AJ, 2026-10-10). */
  sidebarInvoiceAction?: React.ReactNode;
  /**
   * Edit page only (AJ, 2026-09-30): the menu is planned in Menu Approvals, so here it is shown read-only and the
   * form sends no meals (the server leaves the meal plan alone). The banner carries the "Edit Menu" link.
   */
  menuPlanReadOnly?: boolean;
  /**
   * Edit page: when the planner is editable (the menu is still a draft, 2026-10-10) the meals are sent only if they
   * were changed, so saving other fields never rewrites the plan or logs a menu edit.
   */
  menuPlanOnlyIfChanged?: boolean;
  /** Sent to the kitchen or completed: nothing on the order can be changed any more (AJ, 2026-10-14). Payments and the kitchen's own cards still work. */
  locked?: boolean;
  /** Completed: closed completely, so the inventory, expenses and staffing tabs are read-only too (payments still work). */
  completed?: boolean;
  /** Shown above the planner: the menu approval status and what the team can do with it (edit, recall, view only). */
  menuPlanBanner?: React.ReactNode;
  /**
   * Edit page, once the order has a menu approval (Menu Approvals + Orders merge, Decision 11): the meals are edited in the Menu Approval
   * tab only. The planner here is read-only and always shows the saved meal plan (the same stored data the tab edits), never a draft of its own.
   */
  menuPlanInApprovalTab?: boolean;
  /** Order detail only: the Menu Approval tab's content. */
  menuApprovalTab?: React.ReactNode;
  /** Order detail only: the tab to open first (from `?tab=`). */
  initialTab?: string;
  /**
   * The menu is with the customer, approved or with the kitchen (Decision 14): the guest counts and the pricing editor are read-only, like
   * the server enforces. Recall the menu to change them.
   */
  priceFrozen?: boolean;
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
  statusCard,
  detailsExtra,
  inventoryTab,
  expensesTab,
  staffingTab,
  pricingExtra,
  billingPanel,
  sidebarInvoiceAction,
  menuPlanReadOnly = false,
  menuPlanOnlyIfChanged = false,
  locked = false,
  completed = false,
  menuPlanBanner = null,
  menuPlanInApprovalTab = false,
  menuApprovalTab,
  initialTab,
  priceFrozen = false,
  cancelHref = "/orders",
  carriedOverItemsSubtotal = 0,
  onSubmit,
  onSuccess,
  submitLabel,
  onSubmitAndNotify,
}: OrderFormProps) {
  const [activeTab, setActiveTab] = useState<string>(initialTab ?? "details");
  const [approvalSlot, setApprovalSlot] = useState<HTMLElement | null>(null);
  const onApprovalTab = activeTab === "approval" && Boolean(menuApprovalTab);
  // A link to ?tab=... on this page (the banner, the sidebar card, a redirect) opens that tab. Adjusted while rendering, the way React
  // recommends for state that follows a prop, not in an effect.
  const [seenInitialTab, setSeenInitialTab] = useState(initialTab);
  if (initialTab !== seenInitialTab) {
    setSeenInitialTab(initialTab);
    if (initialTab) setActiveTab(initialTab);
  }
  const [values, setValues] = useState<OrderFormValues>({ ...EMPTY_ORDER_VALUES, ...initialValues });
  // Edit mode's already-selected Customer, found once from the full list
  // passed down — CustomerCombobox only needs this single row to seed its
  // display text; it does its own server-side search for anything else.
  const initialSelectedCustomer: SelectedCustomer | null = initialValues?.customerId
    ? (customers.find((c) => c.id === initialValues.customerId) ?? null)
    : null;
  // Who is picked right now — feeds the read-only Email / Phone fields and the Order Summary.
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(initialSelectedCustomer);
  // Editing an order: Customer Details and Order Type read as plain details until Edit is pressed (AJ, 2026-10-16), like Business Settings.
  // Edit only reveals the fields; the changes are saved with the order's Save changes button.
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [editingGuests, setEditingGuests] = useState(false);
  const [guestsBeforeEdit, setGuestsBeforeEdit] = useState<{ adultCount: string; childBelow5Count: string; child5To10Count: string } | null>(null);
  const [editingEvent, setEditingEvent] = useState(false);
  const [eventBeforeEdit, setEventBeforeEdit] = useState<Pick<OrderFormValues, (typeof EVENT_FIELDS)[number]> | null>(null);
  const [customerBeforeEdit, setCustomerBeforeEdit] = useState<{ customerId: string; customer: SelectedCustomer | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"save" | "whatsapp" | null>(null);
  // New order: payments added with Record Payment, held until the order is saved.
  const [draftPayments, setDraftPayments] = useState<StagedPaymentDraft[]>([]);
  // What the form held when it was opened or last saved: anything different is an unsaved change.
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(values));
  const dirty = JSON.stringify(values) !== savedSnapshot || draftPayments.length > 0;
  const guard = useUnsavedChangesGuard(dirty, "order");
  // The planner is read-only when the Menu Approval tab owns the meals (or the menu is out): show the saved plan from the server, so a save
  // made in the tab shows here at once. Both the form's values and its saved snapshot take it, so it never reads as an unsaved change.
  const savedMealsKey = JSON.stringify(initialValues?.mealPlanEntries ?? []);
  const [seenMealsKey, setSeenMealsKey] = useState(savedMealsKey);
  if (seenMealsKey !== savedMealsKey) {
    setSeenMealsKey(savedMealsKey);
    if (menuPlanReadOnly && initialValues) {
      const entries = initialValues.mealPlanEntries ?? [];
      setValues((prev) => ({ ...prev, mealPlanEntries: entries }));
      setSavedSnapshot((snapshot) => JSON.stringify({ ...JSON.parse(snapshot), mealPlanEntries: entries }));
    }
  }
  // Set when the form itself switched the Order Type to Multi Order, so a popup
  // can say why (AJ, 2026-09-27): a date range, or more than one meal type.
  const [multiNotice, setMultiNotice] = useState<"meals" | "multiOn" | "multiOff" | null>(null);
  // Which meal's "Select/Edit Food Items" drawer is open — lifted here (not
  // internal to MenuPlanningSection) so the "Selected Meals" summary card
  // can also open it directly for any date, not just the sidebar-focused one.
  const [foodDialogTarget, setFoodDialogTarget] = useState<{ date: string; mealType: MealTypeValue } | null>(null);

  // True while Multi was chosen by the form itself (not clicked), so it can flip back to Single on its own.
  const [autoSwitchedToMulti, setAutoSwitchedToMulti] = useState(false);

  function setField<K extends keyof OrderFormValues>(key: K, value: OrderFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  // One Order Type (AJ, 2026-10-16) decides the date and meal fields. Multi Order allows several meals, several dates, or both.
  // Going to Single Order keeps one date and one meal type, so anything beyond that is named in a question first, never dropped silently.
  // On an order that is already booked, moving away from its saved Order Type asks first (AJ, 2026-10-14).
  const [pendingKind, setPendingKind] = useState<string | null>(null);

  /** What Single Order would keep (the start date, the first meal type on it) and what it would remove. */
  function singleOrderLoss() {
    const onStart = values.mealPlanEntries.filter((e) => e.date === values.eventStartDate);
    const firstType = onStart[0]?.mealType;
    const kept = firstType ? onStart.filter((e) => e.mealType === firstType) : [];
    return { kept, extraDates: Math.max(enumerateDates(values.eventStartDate, values.eventEndDate).length - 1, 0), removedMeals: values.mealPlanEntries.length - kept.length };
  }

  function requestOrderKind(kind: string) {
    if (kind === values.orderKind) return;
    if (kind === "SINGLE") {
      const loss = singleOrderLoss();
      if (loss.extraDates > 0 || loss.removedMeals > 0) {
        setPendingKind("SINGLE");
        return;
      }
    }
    if (initialValues && kind !== initialValues.orderKind) {
      setPendingKind(kind);
      return;
    }
    applyOrderKind(kind);
    setMultiNotice(kind === "MULTI" ? "multiOn" : "multiOff");
  }

  function applyOrderKind(kind: string) {
    setAutoSwitchedToMulti(false);
    if (kind === "SINGLE") {
      const { kept } = singleOrderLoss();
      setValues((prev) => ({ ...prev, orderKind: "SINGLE", eventEndDate: prev.eventStartDate, mealPlanEntries: kept }));
    } else {
      setField("orderKind", kind);
    }
  }

  /**
   * Multi Order is automatic (AJ, 2026-09-27): a date range, or more than one
   * meal type even on a single day, makes it one. The form switches and says
   * why in a popup. A Multi Order can't be turned back to Single while either
   * still holds (see `multiRequired`).
   */
  function autoMulti(reason: "meals") {
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
  // Same rule as the server (usesIndividualChildRates): the Individual Pricing switch or the method.
  const individualChildRates =
    values.pricingMethod === "INDIVIDUAL" ||
    (values.individualPricingEnabled && ((Number.parseFloat(values.individualChildBelow5Rate) || 0) > 0 || (Number.parseFloat(values.individualChild5To10Rate) || 0) > 0));
  const childrenCharge =
    individualChildRates
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
  // The same children charge split by age band (it is linear in the counts), so the summary can list each band.
  const below5Count = Number(values.childBelow5Count) || 0;
  const child5To10Count = Number(values.child5To10Count) || 0;
  const childBandCharge = (below5: number, to10: number) =>
    individualChildRates
      ? computeIndividualChildrenChargePreview(
          Number.parseFloat(values.individualChildBelow5Rate) || 0,
          values.individualChildBelow5PricingType,
          Number.parseFloat(values.individualChild5To10Rate) || 0,
          values.individualChild5To10PricingType,
          childPricingMenu?.price ?? 0,
          below5,
          to10,
        )
      : computeChildrenChargePreview(childPricingMenu, below5, to10);
  const childBelow5Charge = childBandCharge(below5Count, 0);
  const child5To10Charge = childBandCharge(0, child5To10Count);
  const subtotal = mealItemsSubtotal + mealsSubtotal + childrenCharge + carriedOverItemsSubtotal;
  const eventDaysUntil = daysUntilPreview(values.eventStartDate);
  // No backdated orders (AJ, 2026-09-27). An existing order keeps its own past date untouched.
  const eventDatePast = eventDaysUntil !== null && eventDaysUntil < 0 && values.eventStartDate !== initialValues?.eventStartDate;
  const distinctMealTypes = new Set(values.mealPlanEntries.map((e) => e.mealType)).size;
  const multiRequired = days.length > 1 || distinctMealTypes > 1;
  const isMulti = values.orderKind === "MULTI";
  const singleLoss = singleOrderLoss();
  // Meals owned by the Menu Approval tab can't be removed here, so Single Order stays off until they are recalled.
  const singleBlocked = menuPlanReadOnly && singleLoss.removedMeals > 0;
  // Back to one date and one meal type: undo the automatic switch (AJ, 2026-09-30). A Multi the user picked by hand stays.
  if (autoSwitchedToMulti && !multiRequired) {
    setAutoSwitchedToMulti(false);
    if (values.orderKind === "MULTI") setField("orderKind", "SINGLE");
  }
  const individualOn = values.individualPricingEnabled || values.pricingMethod === "INDIVIDUAL";
  const guestsComputed = (Number(values.adultCount) || 0) + (Number(values.childBelow5Count) || 0) + (Number(values.child5To10Count) || 0);
  // A percentage is of the subtotal (meals + children), to the paisa, like the server (order.ts percentOf).
  const transportationCostNum = values.transportationMode === "PERCENTAGE" ? percentOf(subtotal, Number.parseFloat(values.transportationCost) || 0) : Number.parseFloat(values.transportationCost) || 0;
  const discountNum = values.discountMode === "PERCENTAGE" ? percentOf(subtotal, Number.parseFloat(values.discount) || 0) : Number.parseFloat(values.discount) || 0;
  const otherChargesNum = values.otherChargesMode === "PERCENTAGE" ? percentOf(subtotal, Number.parseFloat(values.otherCharges) || 0) : Number.parseFloat(values.otherCharges) || 0;
  // A percentage line is a rate of the subtotal; the server resolves it the same way (resolveCustomCharges).
  const customChargeLines = resolveCustomCharges(parseCustomCharges(values.customCharges.map(customChargeInput)), subtotal);
  const customChargesNum = sumCustomCharges(customChargeLines);
  // Mirrors order.ts's server-side recalculateOrderTotals exactly.
  const total = subtotal - discountNum + transportationCostNum + otherChargesNum + customChargesNum;
  const perHead = (charge: number, count: number) => `${count} × ${formatCurrency(count > 0 ? charge / count : 0)}`;
  const priceLines: OrderPriceLine[] = [
    { label: "Meals", amount: mealsSubtotal },
    ...(mealItemsSubtotal > 0 ? [{ label: "Extra dishes & add-ons", amount: mealItemsSubtotal }] : []),
    ...(carriedOverItemsSubtotal > 0 ? [{ label: "Carried over from Quotation", amount: carriedOverItemsSubtotal }] : []),
    ...(below5Count > 0 ? [{ label: "Children (Under 5)", detail: childBelow5Charge > 0 ? perHead(childBelow5Charge, below5Count) : `${below5Count} · no charge`, amount: childBelow5Charge }] : []),
    ...(child5To10Count > 0 ? [{ label: "Children (5–10)", detail: child5To10Charge > 0 ? perHead(child5To10Charge, child5To10Count) : `${child5To10Count} · no charge`, amount: child5To10Charge }] : []),
    ...(transportationCostNum > 0 ? [{ label: "Transportation Cost", detail: values.transportationMode === "PERCENTAGE" ? `${values.transportationCost}% of subtotal` : undefined, amount: transportationCostNum }] : []),
    ...(otherChargesNum > 0 ? [{ label: "Extra / Service Cost", detail: values.otherChargesMode === "PERCENTAGE" ? `${values.otherCharges}% of subtotal` : undefined, amount: otherChargesNum }] : []),
    ...customChargeLines.map((c) => ({ label: c.label, detail: c.mode === "PERCENTAGE" ? `${c.rate}% of subtotal` : undefined, amount: c.amount })),
    ...(discountNum > 0 ? [{ label: "Discount", detail: values.discountMode === "PERCENTAGE" ? `${values.discount}% of subtotal` : undefined, amount: discountNum, negative: true }] : []),
  ];

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
    // New order only: the payments added on this page, recorded once the order is saved.
    if (!initialValues) formData.set("payments", JSON.stringify(draftPayments.map(({ amount, type, method, receivedAt, reference, sendReceipt }) => ({ amount, type, method, receivedAt, reference, sendReceipt }))));
    formData.set("notes", values.notes);
    formData.set("kitchenNotes", values.kitchenNotes);
    formData.set("staffingNotes", values.staffingNotes);
    const mealPlanChanged = JSON.stringify(values.mealPlanEntries) !== JSON.stringify(initialValues?.mealPlanEntries ?? []);
    if (menuPlanReadOnly || (menuPlanOnlyIfChanged && !mealPlanChanged)) formData.set("mealPlanLocked", "true");
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
    if (locked) return;
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
    if (!initialValues && draftPayments.reduce((sum, p) => sum + p.amount, 0) > total + 0.005) {
      setError("The payments added are more than the order total. Remove one, or raise the total.");
      return;
    }
    setPending(notifyWhatsApp ? "whatsapp" : "save");

    const submitFn = notifyWhatsApp && onSubmitAndNotify ? onSubmitAndNotify : onSubmit;
    const submitted = JSON.stringify(values);
    const result = await submitFn(buildFormData());
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSavedSnapshot(submitted); // saved: leaving now loses nothing
    onSuccess();
  }

  const startsIn = startsInPreview(eventDaysUntil);
  const totalGuests = String(guestsComputed);
  const orderTypeOptions = [
    { value: "SINGLE", label: "Single Order", hint: "One date, one meal type" },
    { value: "MULTI", label: "Multi Order", hint: "Several meals, several dates, or both" },
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

  const detailView = !!initialValues;
  const editButton = (label: string, ariaLabel: string, onClick: () => void) =>
    locked ? null : (
      <Button type="button" variant="outline" size="md" aria-label={ariaLabel} onClick={onClick}>
        <Pencil data-icon="inline-start" />
        {label}
      </Button>
    );
  const customerReadOnly = detailView && !editingCustomer;
  const customerSection = customerReadOnly ? (
    <FormSection
      {...sec(1, User)}
      title="Customer Details"
      action={editButton("Edit", "Edit customer details", () => {
        setCustomerBeforeEdit({ customerId: values.customerId, customer: selectedCustomer });
        setEditingCustomer(true);
      })}
    >
      <SummaryRow label="Customer">
        <span className="break-words">{selectedCustomer?.name ?? "Not selected"}</span>
      </SummaryRow>
      <SummaryRow label="Email">
        <span className="break-words">{selectedCustomer?.email || "Not set"}</span>
      </SummaryRow>
      <SummaryRow label="Phone">{selectedCustomer?.phone || "Not set"}</SummaryRow>
    </FormSection>
  ) : (
  <FormSection {...sec(1, User)} title="Customer Details" description="Search for an existing customer or add a new one."
    action={
      detailView ? (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={() => {
              if (customerBeforeEdit) {
                setField("customerId", customerBeforeEdit.customerId);
                setSelectedCustomer(customerBeforeEdit.customer);
              }
              setEditingCustomer(false);
            }}
          >
            Cancel
          </Button>
          <Button type="button" size="md" disabled={!values.customerId} onClick={() => setEditingCustomer(false)}>
            Done
          </Button>
        </div>
      ) : undefined
    }
  >
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="order-customer" required>Customer</Label>
      <CustomerCombobox
        id="order-customer"
        initialCustomer={selectedCustomer}
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
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-customer-email">Email</Label>
        <Input id="order-customer-email" readOnly tabIndex={-1} className="bg-muted" value={selectedCustomer?.email ?? ""} placeholder="Filled in from the customer" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-customer-phone">Phone</Label>
        <PhoneInput id="order-customer-phone" disabled value={selectedCustomer?.phone ?? ""} onChange={() => {}} />
      </div>
    </div>
  </FormSection>
  );

  const optionLabel = (options: readonly { value: string; label: string }[], value: string) => options.find((o) => o.value === value)?.label ?? "Not set";
  const eventReadOnly = detailView && !editingEvent;
  const eventViewFields: [string, React.ReactNode][] = [
    ["Order Type", values.orderKind === "MULTI" ? "Multi Order" : "Single Order"],
    ["Event Type", eventTypeName ?? "Not set"],
    ["Event Date", eventDateText],
    ["Venue Type", optionLabel(VENUE_TYPE_OPTIONS, values.venueType)],
    ["Venue / Building Name", values.venue || "Not set"],
    ["Complete Venue Address", values.eventAddress || "Not set"],
    ["Door / Flat / House No.", values.venueDoorNumber || "Not set"],
    ["Tower / Block", values.venueTower || "Not set"],
    ["Floor", values.venueFloor || "Not set"],
    ["Landmark", values.venueLandmark || "Not set"],
    ["Venue Contact Person", values.venueContactName || "Not set"],
    ["Contact Number", values.venueContactPhone || "Not set"],
    ["Vehicle Access", optionLabel(VEHICLE_ACCESS_OPTIONS, values.vehicleAccess)],
    ["Catering Access / Loading Instructions", values.venueAccessInstructions || "Not set"],
    ["Delivery Instructions", values.deliveryInstructions || "Not set"],
    ["Cooking Instructions", values.cookingInstructions || "Not set"],
    ["Cooking / live counter facility", values.liveCounterAvailable ? "Available" : "Not available"],
    ["Gas / electric connection at venue", values.gasElectricAvailable ? "Available" : "Not available"],
  ];
  const eventSection = eventReadOnly ? (
  <FormSection
    {...sec(3, CalendarDays)}
    title="Event Information"
    action={editButton("Edit", "Edit event information", () => {
      setEventBeforeEdit(Object.fromEntries(EVENT_FIELDS.map((key) => [key, values[key]])) as Pick<OrderFormValues, (typeof EVENT_FIELDS)[number]>);
      setEditingEvent(true);
    })}
  >
    <dl className="grid grid-cols-1 gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
      {eventViewFields.map(([label, value]) => (
        <div key={label} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="break-words font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  </FormSection>
  ) : (
  <FormSection
    {...sec(3, CalendarDays)}
    title="Event Information"
    description="Tell us about the event and where it will take place."
    action={
      detailView ? (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={() => {
              if (eventBeforeEdit) {
                setValues((prev) => ({ ...prev, ...eventBeforeEdit }));
              }
              setEditingEvent(false);
            }}
          >
            Cancel
          </Button>
          <Button type="button" size="md" onClick={() => setEditingEvent(false)}>
            Done
          </Button>
        </div>
      ) : undefined
    }
  >
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-2 sm:col-span-2" role="group" aria-label="Order Type">
        <Label>Order Type</Label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {orderTypeOptions.map((option) => {
            const selected = values.orderKind === option.value;
            const blocked = option.value === "SINGLE" && singleBlocked;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => requestOrderKind(option.value)}
                disabled={blocked}
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
        {singleBlocked && <p className="text-xs text-muted-foreground">The meals are with the customer or the kitchen. Recall the menu to switch to a Single Order.</p>}
      </div>
      <div className={cn("flex flex-col gap-1.5", isMulti && "sm:col-span-2")}>
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
      <div className={cn("flex flex-col gap-1.5", isMulti && "sm:col-span-2")}>
        <Label htmlFor={isMulti ? "order-event-start" : "order-event-date"} required>{isMulti ? "Event Dates" : "Event Date"}</Label>
        <div className="flex items-stretch gap-2">
          {isMulti ? (
            <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Event start date</span>
                <DateRangePicker
                  single
                  id="order-event-start"
                  ariaLabel="Event start date"
                  startDate={values.eventStartDate}
                  endDate={values.eventStartDate}
                  onChange={(start) => setEventDateRange(start, values.eventEndDate && values.eventEndDate >= start ? values.eventEndDate : start)}
                  minDate={toLocalIsoDate(new Date())}
                  loadOrderCounts={getOrderCountsByDayAction}
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Event end date</span>
                <DateRangePicker
                  single
                  id="order-event-end"
                  ariaLabel="Event end date"
                  startDate={values.eventEndDate}
                  endDate={values.eventEndDate}
                  onChange={(end) => setEventDateRange(values.eventStartDate || end, end)}
                  minDate={values.eventStartDate || toLocalIsoDate(new Date())}
                  loadOrderCounts={getOrderCountsByDayAction}
                />
              </div>
            </div>
          ) : (
            <div className="min-w-0 flex-1">
              <DateRangePicker
                single
                id="order-event-date"
                startDate={values.eventStartDate}
                endDate={values.eventStartDate}
                onChange={(day) => setEventDateRange(day, day)}
                minDate={toLocalIsoDate(new Date())}
                loadOrderCounts={getOrderCountsByDayAction}
              />
            </div>
          )}
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

  const guestsReadOnly = detailView && !editingGuests;
  const guestSection = guestsReadOnly ? (
  <FormSection
    {...sec(4, Users)}
    title="Guest Information"
    action={locked || priceFrozen ? null : editButton("Edit", "Edit guest information", () => {
      setGuestsBeforeEdit({ adultCount: values.adultCount, childBelow5Count: values.childBelow5Count, child5To10Count: values.child5To10Count });
      setEditingGuests(true);
    })}
  >
    <dl className="grid grid-cols-4 gap-4 text-sm">
      {[
        ["Adults", values.adultCount || "0"],
        ["Children (Under 5)", values.childBelow5Count || "0"],
        ["Children (5–10)", values.child5To10Count || "0"],
        ["Total Guests", String(guestsComputed)],
      ].map(([label, value]) => (
        <div key={label} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  </FormSection>
  ) : (
  <FormSection
    {...sec(4, Users)}
    title="Guest Information"
    description="Enter the expected guest count. This will be used for all selected meals."
    action={
      detailView ? (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={() => {
              if (guestsBeforeEdit) setValues((prev) => ({ ...prev, ...guestsBeforeEdit }));
              setEditingGuests(false);
            }}
          >
            Cancel
          </Button>
          <Button type="button" size="md" onClick={() => setEditingGuests(false)}>
            Done
          </Button>
        </div>
      ) : undefined
    }
  >
    <div className="grid grid-cols-4 gap-4">
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
        <Input id="order-total-guests" readOnly tabIndex={-1} className="bg-muted" value={String(guestsComputed)} />
      </div>
    </div>
  </FormSection>
  );

  const menuSection = (
  <FormSection
    {...sec(5, UtensilsCrossed)}
    title="Menu Planning"
    description={menuPlanInApprovalTab ? "The menu is planned in the Menu Approval tab, so it is shown here as read-only. Edit meals and dishes there." : menuPlanReadOnly ? "The menu is with the customer or the kitchen. Recall it to change it; changes are approved again before they reach the kitchen." : "Select meals and assign menu items for this event."}
    action={menuPlanReadOnly ? null : individualToggle}
  >
    {menuPlanBanner}
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
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="order-staffing-notes">Staffing &amp; Logistics Notes</Label>
        <Textarea id="order-staffing-notes" value={values.staffingNotes} onChange={(e) => setField("staffingNotes", e.target.value)} />
        <p className="text-xs text-muted-foreground">Internal — anything about the crew, vehicles, timings or setup. The numbers per duty go in the Staffing &amp; Logistics tab.</p>
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
        ? "Individual Pricing is on (switch it in Menu Planning). Set your own per-plate price for each meal and each child age band. Children can be Per Plate or a Percentage of the first assigned Menu's price."
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
      {below5Count + child5To10Count > 0 && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Children Charges</span>
          <span>{formatCurrency(childrenCharge)}</span>
        </div>
      )}
      {below5Count + child5To10Count > 0 && childrenCharge === 0 && (
        <p className="text-xs text-muted-foreground" data-testid="children-no-rate">
          {childPricingMenu
            ? individualOn
              ? "No child rate is set. Enter the child prices above."
              : `${childPricingMenu.name} has no child rate set, so children are not charged. Set it on the Menu, or turn on Individual Pricing.`
            : "Children are priced from the first Menu assigned in Menu Planning. Assign a Menu to charge them."}
        </p>
      )}
      {(
        [
          { id: "order-transportation-cost", label: "Transportation Cost", key: "transportationCost", modeKey: "transportationMode" },
          { id: "order-other-charges", label: "Extra / Service Cost", key: "otherCharges", modeKey: "otherChargesMode" },
          { id: "order-discount", label: "Discount", key: "discount", modeKey: "discountMode" },
        ] as const
      ).map((row) => {
        const mode = row.modeKey ? values[row.modeKey] : "FIXED";
        return (
          <div key={row.id} className="flex items-center justify-between gap-3">
            <Label htmlFor={row.id} className="font-normal text-muted-foreground">
              {row.label}
            </Label>
            <div className="flex items-center gap-2">
              {row.modeKey && (
                <Select
                  items={{ FIXED: "₹", PERCENTAGE: "%" }}
                  value={mode}
                  onValueChange={(v) => setField(row.modeKey, v === "PERCENTAGE" ? "PERCENTAGE" : "FIXED")}
                >
                  <SelectTrigger aria-label={`${row.label} type`} className="w-16">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIXED">₹</SelectItem>
                    <SelectItem value="PERCENTAGE">%</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <Input
                id={row.id}
                type="number"
                min="0"
                max={mode === "PERCENTAGE" ? 100 : undefined}
                step="0.01"
                className="w-28 text-right"
                value={values[row.key]}
                onChange={(e) => setField(row.key, e.target.value)}
              />
            </div>
          </div>
        );
      })}
      {values.customCharges.map((row, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            aria-label={`Charge ${index + 1} label`}
            placeholder="Label (e.g. Generator)"
            maxLength={80}
            className="min-w-0 flex-1"
            value={row.label}
            onChange={(e) => setField("customCharges", values.customCharges.map((c, i) => (i === index ? { ...c, label: e.target.value } : c)))}
          />
          <Select
            items={{ FIXED: "₹", PERCENTAGE: "%" }}
            value={row.mode}
            onValueChange={(v) => setField("customCharges", values.customCharges.map((c, i) => (i === index ? { ...c, mode: v === "PERCENTAGE" ? "PERCENTAGE" : "FIXED" } : c)))}
          >
            <SelectTrigger aria-label={`Charge ${index + 1} type`} className="w-16">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="FIXED">₹</SelectItem>
              <SelectItem value="PERCENTAGE">%</SelectItem>
            </SelectContent>
          </Select>
          <Input
            aria-label={`Charge ${index + 1} amount`}
            type="number"
            min="0"
            max={row.mode === "PERCENTAGE" ? 100 : undefined}
            step="0.01"
            className="w-28 text-right"
            value={row.amount}
            onChange={(e) => setField("customCharges", values.customCharges.map((c, i) => (i === index ? { ...c, amount: e.target.value } : c)))}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove charge ${index + 1}`}
            onClick={() => setField("customCharges", values.customCharges.filter((_, i) => i !== index))}
          >
            <X className="size-4" />
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
    <div className="flex items-center justify-between gap-3 rounded-lg bg-accent px-4 py-3 font-semibold text-accent-foreground">
      <span>Grand Total</span>
      <span className="text-lg">{formatCurrency(total)}</span>
    </div>
  </SummaryCard>
  );

  const multiDialog = (
  <>
  <AlertDialog open={pendingKind !== null} onOpenChange={(open) => !open && setPendingKind(null)}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Change this order to {pendingKind === "MULTI" ? "Multi Order" : "Single Order"}?</AlertDialogTitle>
        <AlertDialogDescription>
          {pendingKind === "MULTI"
            ? "Multi Order is for several meals, several dates, or both. You can change it back before saving."
            : singleLoss.extraDates > 0 || singleLoss.removedMeals > 0
              ? `Single Order keeps one date (${values.eventStartDate ? formatDay(values.eventStartDate, { day: "numeric", month: "short", year: "numeric" }) : "the start date"}) and one meal type. This removes ${[
                  singleLoss.extraDates > 0 ? `${singleLoss.extraDates} extra ${singleLoss.extraDates === 1 ? "date" : "dates"}` : "",
                  singleLoss.removedMeals > 0 ? `${singleLoss.removedMeals} planned ${singleLoss.removedMeals === 1 ? "meal" : "meals"}, with their menus and food items` : "",
                ].filter(Boolean).join(" and ")}. Cancel to keep everything as it is.`
              : "Single Order is for one date and one meal type. You can change it back before saving."}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Keep {values.orderKind === "MULTI" ? "Multi Order" : "Single Order"}</AlertDialogCancel>
        <AlertDialogAction
          onClick={() => {
            if (pendingKind) applyOrderKind(pendingKind);
            setPendingKind(null);
          }}
        >
          {pendingKind === "SINGLE" && (singleLoss.extraDates > 0 || singleLoss.removedMeals > 0) ? "Switch and remove" : "Change type"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  <AlertDialog open={multiNotice !== null} onOpenChange={(open) => !open && setMultiNotice(null)}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{multiNotice === "multiOff" ? "Order Type changed to Single Order" : "Order Type changed to Multi Order"}</AlertDialogTitle>
        <AlertDialogDescription>
          {multiNotice === "multiOn"
            ? "This is now a Multi Order. Pick a start and end date (the same day for several meals on one day); Menu Planning groups each date into its own event."
            : multiNotice === "multiOff"
              ? "This is now a Single Order: one date and one meal type."
              : "You picked more than one meal type, so this is now a Multi Order, even on a single day. Menu Planning groups the meals into their own events."}{" "}
          {multiNotice === "multiOff" ? "" : "Your meals, menus and food items are kept."}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogAction onClick={() => setMultiNotice(null)}>Got it</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
  </>
  );

  const pricingSummaryCard = (
    <SummaryCard icon={Wallet} title="Pricing Details">
      <div className="flex flex-col gap-3 text-sm">
        {[
          { label: "Total Amount", amount: mealItemsSubtotal + mealsSubtotal + carriedOverItemsSubtotal },
          ...(below5Count + child5To10Count > 0 ? [{ label: "Children Charges", amount: childrenCharge }] : []),
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

  // Locked orders (sent to the kitchen): the fields stay on screen at full strength but cannot be changed. A disabled
  // fieldset covers every input and button inside; the pointer rules cover Base UI dropdowns, which are not native controls.
  const freeze = (node: React.ReactNode, when: boolean = locked) =>
    when ? (
      <fieldset disabled className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0 [&_:disabled]:bg-muted! [&_:disabled]:opacity-100! [&_button]:pointer-events-none [&_[role=combobox]]:pointer-events-none" data-testid="order-locked-fields">
        {node}
      </fieldset>
    ) : (
      node
    );

  const tabs: FormTab[] = [
    {
      id: "details",
      label: "Order Details",
      panel: (
        <>
          {freeze(
            <>
              {customerSection}
            </>,
          )}
          {detailsExtra}
        </>
      ),
    },
    {
      id: "menu",
      label: "Guests & Event Info",
      panel: (
        <>
          {freeze(guestSection, locked || priceFrozen)}
          {freeze(eventSection)}
          {multiDialog}
          {/* Once a menu approval exists the menu is planned in the Menu Approval tab, not here. Before that this is the only place to enter meals. */}
          {menuPlanInApprovalTab ? null : freeze(menuSection)}
        </>
      ),
    },
    ...(menuApprovalTab
      ? [
          {
            id: "approval",
            label: "Menu Approval",
            // Its own fields (the price quote, the note box) act on the approval, not the order: Enter there must not submit the order form.
            panel: (
              <div
                className="flex min-w-0 flex-col gap-6"
                data-testid="order-approval-tab"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.target instanceof HTMLInputElement && e.target.type !== "checkbox") e.preventDefault();
                }}
              >
                {menuApprovalTab}
              </div>
            ),
          },
        ]
      : []),
    { id: "additional", label: "Additional Details", panel: freeze(additionalSection) },
    {
      id: "pricing",
      label: "Pricing & Payment",
      // Two columns on a wide screen: what the order costs on the left, what has been paid on the right.
      panel: (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-4">
            {pricingExtra}
            {freeze(pricingEditorCard, locked || priceFrozen)}
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            {/* Editing an order: Payment summary, history and Record Payment own the money, and the payment status follows the payments. */}
            {/* Payment summary and Payments are the same on a new order and an existing one; a new order holds its payments until it is saved. */}
            {initialValues ? null : <DraftPaymentsPanel total={total} payments={draftPayments} onChange={setDraftPayments} />}
            {billingPanel}
          </div>
        </div>
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
          {freeze(inventoryTab, completed)}
        </div>
      ),
    },
        ]
      : []),
    ...(expensesTab ? [{ id: "expenses", label: "Expenses", panel: freeze(expensesTab, completed) }] : []),
    ...(staffingTab ? [{ id: "staffing", label: "Staffing & Logistics", panel: freeze(staffingTab, completed) }] : []),
  ];

  return (
    <LiveOrderTotalProvider value={initialValues && dirty ? total : null}>
    <OrderPriceLinesProvider value={priceLines}>
    <ApprovalSidebarSlotProvider value={approvalSlot}>
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
            {/* Never just "Cancel" on an order: that reads as cancelling the order itself. */}
            <Button type="button" variant="outline" onClick={() => guard.requestLeave(cancelHref)}>
              {dirty ? (
                "Discard changes"
              ) : (
                <>
                  <ArrowLeft /> Back to orders
                </>
              )}
            </Button>
            {onSubmitAndNotify && !locked && (
              <Button type="button" variant="outline" disabled={pending !== null} onClick={() => void handleSubmit(true)}>
                {pending === "whatsapp" ? "Sending…" : "Create & Send WhatsApp"}
              </Button>
            )}
            {/* On a big screen Save lives in the sticky card beside the form; here for a phone or tablet. */}
            <Button type="submit" className={cn("lg:hidden", locked && "hidden")} disabled={pending !== null}>
              {pending === "save" ? "Saving…" : submitLabel}
            </Button>
          </div>
        </div>
        {dirty && (
          <p role="status" className="-mt-3 text-xs font-medium text-warning lg:hidden">
            Unsaved changes
          </p>
        )}

        {locked && (
          <div role="status" className="flex items-start gap-3 rounded-xl border border-info/30 bg-info/10 p-4 text-sm" data-testid="order-locked-banner">
            <Lock className="mt-0.5 size-4 shrink-0 text-info" />
            <div>
              <p className="font-semibold">{completed ? "Completed: this order can't be changed any more." : "Sent to the kitchen: this order can't be changed any more."}</p>
              <p className="text-muted-foreground">
                {completed ? "You can still record payments and send invoices." : "You can still record payments and send invoices. If the send was a mistake, change the status with a reason first."}
              </p>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          {/* ---------------- Main column ---------------- */}
          <div className="flex min-w-0 flex-col gap-4">
            <FormTabs tabs={tabs} idPrefix="order" activeId={activeTab} onActiveChange={setActiveTab} />
          </div>

          {/* ---------------- Summary column ---------------- */}
          <aside className={cn("flex min-w-0 flex-col gap-4", onApprovalTab ? "lg:self-start" : "lg:self-stretch")}>
            {activeTab === "pricing" && sidebarInvoiceAction}
            {/* The Menu Approval tab puts its Menu Status, Notes, history and pricing cards here (order-menu-approval-tab.tsx). */}
            {menuApprovalTab && <div ref={setApprovalSlot} id="order-approval-sidebar" className={activeTab === "approval" ? "flex min-w-0 flex-col gap-4" : "hidden"} />}
            {/* The Menu Approval tab has its own four cards and its own Save Changes, so the order's summary, pricing and Save card step aside there. */}
            <div className={onApprovalTab ? "hidden" : "contents"}>
              {statusCard}
              {sidebarTop ?? orderSummaryCard}
              {!sidebarTop && pricingSummaryCard}
              {/* Save stays at the bottom of the summary column and in view while a long order scrolls (AJ, 2026-10-14). */}
              <div className="mt-auto hidden flex-col gap-2 rounded-xl bg-card p-3 ring-1 ring-foreground/10 lg:sticky lg:bottom-4 lg:z-10 lg:flex" data-testid="order-save-card" hidden={locked}>
                {dirty && (
                  <p role="status" className="text-center text-xs font-medium text-warning" data-testid="unsaved-note">
                    Unsaved changes
                  </p>
                )}
                <Button type="submit" disabled={pending !== null}>
                  {pending === "save" ? "Saving…" : submitLabel}
                </Button>
              </div>
            </div>
          </aside>
        </div>
      </form>
      {guard.dialog}
    </ApprovalSidebarSlotProvider>
    </OrderPriceLinesProvider>
    </LiveOrderTotalProvider>
  );
}
