"use client";

import { useState } from "react";
import { ArrowLeft, CalendarDays, FileText, Info, Lock, TriangleAlert, ClipboardList, MapPin, Pencil, Plus, Tag, Trash2, User, Users, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconInput } from "@/components/ui/icon-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { PhoneInput } from "@/components/ui/phone-input";
import { EventVenuesEditor, SameVenueQuestion, eventPlace, eventSlotKey, eventVenueToInput, missingEventVenueField, type EventSlot, type EventVenueValues } from "./event-venues-editor";
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
import { MEAL_TYPES, type MealSelection, type MenuOption } from "@/components/catalog/menu-planning-section";
import { DraftPaymentsPanel } from "./draft-payments-panel";
import type { StagedPaymentDraft } from "../../invoices/_components/payments-panel";
import { useUnsavedChangesGuard } from "@/components/unsaved-changes-guard";
import { cn } from "cn";
import { FormSection, SummaryCard, SummaryRow } from "./order-form-parts";
import { IconTip } from "@/components/ui/icon-tip";
import { FormTabs, type FormTab } from "./form-tabs";
import { computeChildrenCharge, computeIndividualChildrenCharge, deriveStandardChildPricingMenuId, priceMeals, type ChildPricingType } from "@/modules/orders/meal-pricing";
import { customChargeInput, daysUntilPreview, enumerateDates, formatCurrency, startsInPreview } from "@/components/orders/form-helpers";
import { toLocalIsoDate } from "@/lib/time/local-date";
import { percentOf } from "@/modules/orders/amount";
import { orderBlockingField, orderMissingMessage } from "@/modules/orders/required-fields";
import { ApprovalSidebarSlotProvider } from "@/modules/menu-approvals/_components/review/sidebar-slot";
import { ApprovalSavePublisherProvider, UnsavedOrderEditsProvider, type ApprovalSaveState } from "@/modules/menu-approvals/_components/review/approval-save-slot";
import { LiveOrderTotalProvider, OrderPriceLinesProvider, type OrderPriceLine } from "@/modules/orders/live-total";
import { MAX_CUSTOM_CHARGES, parseCustomCharges, resolveCustomCharges, sumCustomCharges } from "@/modules/orders/custom-charges";
import { TONE_SURFACE, TONE_TEXT } from "./order-display";
import { getOrderCountsByDayAction, searchCustomersAction, createCustomerForOrderAction, type ActionResult } from "../actions";

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
  /** The venue differs by event (a Multi Order): one venue per event, keyed "YYYY-MM-DD-MEALTYPE". Otherwise the order's own venue fields above are the venue for all. */
  venuePerEvent: boolean;
  eventVenues: Record<string, EventVenueValues>;
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
  venuePerEvent: false,
  eventVenues: {},
  status: "PENDING_REVIEW",
  notes: "",
  kitchenNotes: "",
  staffingNotes: "",
  mealPlanEntries: [],
};

/** The fields the Event Information card edits, kept so Cancel can put them back. */
const EVENT_FIELDS = [
  "orderKind", "eventTypeId", "eventStartDate", "eventEndDate", "mealPlanEntries", "venueType", "venue", "eventAddress", "venueDoorNumber", "venueTower", "venueFloor",
  "venueLandmark", "venueContactName", "venueContactPhone", "vehicleAccess", "venueAccessInstructions", "deliveryInstructions", "cookingInstructions", "venuePerEvent", "eventVenues",
  "liveCounterAvailable", "gasElectricAvailable",
] as const;

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
   * Edit page: when the planner is editable (the menu is still a draft, 2026-10-10) the meals are sent only if they
   * were changed, so saving other fields never rewrites the plan or logs a menu edit.
   */
  menuPlanOnlyIfChanged?: boolean;
  /** Sent to the kitchen or completed: nothing on the order can be changed any more (AJ, 2026-10-14). Payments and the kitchen's own cards still work. */
  locked?: boolean;
  /** Completed: closed completely, so the inventory, expenses and staffing tabs are read-only too (payments still work). */
  completed?: boolean;
  /** Order detail only: the Menu Approval tab's content. */
  menuApprovalTab?: React.ReactNode;
  /** Order detail only: the tab to open first (from `?tab=`). */
  initialTab?: string;
  /**
   * The menu is with the customer, approved or with the kitchen (Decision 14): the guest counts and the pricing editor are read-only, like
   * the server enforces. Recall the menu to change them.
   */
  priceFrozen?: boolean;
  /** The menu is in front of the customer right now: Customer Details and Event Information lose their Edit too (AJ, 2026-10-16). */
  withCustomer?: boolean;
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
  /**
   * Whether the viewer may see prices (Sensitive data: orderPrices). When false the server also sent no price (menus at 0, items at 0,
   * charges blank), the Pricing & Payment tab and the price summary are not drawn, and the server keeps the saved pricing whatever the
   * form sends (updateOrderAction), so the total is still worked out, on the server only.
   */
  showPrices?: boolean;
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
  menuPlanOnlyIfChanged = false,
  locked = false,
  completed = false,
  menuApprovalTab,
  initialTab,
  priceFrozen = false,
  withCustomer = false,
  cancelHref = "/orders",
  carriedOverItemsSubtotal = 0,
  showPrices = true,
  onSubmit,
  onSuccess,
  submitLabel,
  onSubmitAndNotify,
}: OrderFormProps) {
  // The old Guests & Event Info tab (`?tab=menu`) is part of Order Details now.
  const tabFor = (tab: string | undefined) => (tab === "menu" ? "details" : tab);
  const [activeTab, setActiveTab] = useState<string>(tabFor(initialTab) ?? "details");
  const [approvalSlot, setApprovalSlot] = useState<HTMLElement | null>(null);
  const onApprovalTab = activeTab === "approval" && Boolean(menuApprovalTab);
  // While the Menu Approval tab is open the Save buttons save its meal plan (the tab publishes its save here).
  const [approvalSave, setApprovalSave] = useState<ApprovalSaveState | null>(null);
  // A link to ?tab=... on this page (the banner, the sidebar card, a redirect) opens that tab. Adjusted while rendering, the way React
  // recommends for state that follows a prop, not in an effect.
  const [seenInitialTab, setSeenInitialTab] = useState(initialTab);
  if (initialTab !== seenInitialTab) {
    setSeenInitialTab(initialTab);
    if (initialTab) setActiveTab(tabFor(initialTab) ?? "details");
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
  // Which event's venue the per-event editor is showing.
  const [activeVenueKey, setActiveVenueKey] = useState("");
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
    if (initialValues) {
      const entries = initialValues.mealPlanEntries ?? [];
      setValues((prev) => ({ ...prev, mealPlanEntries: entries }));
      setSavedSnapshot((snapshot) => JSON.stringify({ ...JSON.parse(snapshot), mealPlanEntries: entries }));
    }
  }
  // Set when the form itself switched the Order Type to Multi Order, so a popup
  // can say why (AJ, 2026-09-27): a date range, or more than one meal type.
  const [multiNotice, setMultiNotice] = useState<"multiOn" | "multiOff" | null>(null);


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
    if (kind === "SINGLE") {
      const { kept } = singleOrderLoss();
      setValues((prev) => ({ ...prev, orderKind: "SINGLE", eventEndDate: prev.eventStartDate, mealPlanEntries: kept }));
    } else {
      setField("orderKind", kind);
    }
  }

  /**
   * DateRangePicker's onChange — replaces separate start/end date inputs.
   */
  function setEventDateRange(startDate: string, endDate: string) {
    setField("eventStartDate", startDate);
    setField("eventEndDate", endDate);
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
  // Same rule as the server (usesIndividualChildRates): the Individual Pricing switch or the method.
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
  // The same children charge split by age band (it is linear in the counts), so the summary can list each band.
  const below5Count = Number(values.childBelow5Count) || 0;
  const child5To10Count = Number(values.child5To10Count) || 0;
  const childBandCharge = (below5: number, to10: number) =>
    individualChildRates
      ? computeIndividualChildrenCharge(
          { individualChildBelow5Rate: Number.parseFloat(values.individualChildBelow5Rate) || 0, individualChildBelow5PricingType: values.individualChildBelow5PricingType as ChildPricingType, individualChild5To10Rate: Number.parseFloat(values.individualChild5To10Rate) || 0, individualChild5To10PricingType: values.individualChild5To10PricingType as ChildPricingType },
          childPricingMenu?.price ?? 0,
          below5,
          to10,
        )
      : computeChildrenCharge(childPricingMenu ? { ...childPricingMenu, pricePerPlate: childPricingMenu.price } : null, below5, to10);
  const childBelow5Charge = childBandCharge(below5Count, 0);
  const child5To10Charge = childBandCharge(0, child5To10Count);
  const subtotal = mealItemsSubtotal + mealsSubtotal + childrenCharge; // carried-over Quotation items are informational, not priced (same as the server)
  const eventDaysUntil = daysUntilPreview(values.eventStartDate);
  // No backdated orders (AJ, 2026-09-27). An existing order keeps its own past date untouched.
  const eventDatePast = eventDaysUntil !== null && eventDaysUntil < 0 && values.eventStartDate !== initialValues?.eventStartDate;
  const isMulti = values.orderKind === "MULTI";
  const singleLoss = singleOrderLoss();
  // Meals owned by the Menu Approval tab can't be removed here, so Single Order stays off until they are recalled.
  const singleBlocked = singleLoss.removedMeals > 0;
  // The events (a day and a meal) the venue can differ by: the customer's Venue & Delivery step lists the same ones.
  const slotMeals = [...new Map(values.mealPlanEntries.map((e) => [eventSlotKey(e.date, e.mealType), e])).values()].sort((a, b) => eventSlotKey(a.date, a.mealType).localeCompare(eventSlotKey(b.date, b.mealType)));
  const slotDates = [...new Set(slotMeals.map((e) => e.date))];
  const eventSlots: EventSlot[] = slotMeals.map((e) => {
    const meal = MEAL_TYPES.find((m) => m.value === e.mealType)?.label ?? e.mealType;
    return { key: eventSlotKey(e.date, e.mealType), date: e.date, title: slotDates.length > 1 ? `Day ${slotDates.indexOf(e.date) + 1} · ${meal}` : meal, menuName: menus.find((m) => m.id === e.menuId)?.name ?? "" };
  });
  const canDiffer = eventSlots.length > 1;
  const perEvent = canDiffer && values.venuePerEvent;
  const venueFromValues = (v: OrderFormValues): EventVenueValues => ({
    venueType: v.venueType,
    venue: v.venue,
    venueDoorNumber: v.venueDoorNumber,
    venueTower: v.venueTower,
    venueFloor: v.venueFloor,
    eventAddress: v.eventAddress,
    venueLandmark: v.venueLandmark,
    venueContactName: v.venueContactName,
    venueContactPhone: v.venueContactPhone,
    venueAccessInstructions: v.venueAccessInstructions,
    cookingInstructions: v.cookingInstructions,
    gasElectricAvailable: v.gasElectricAvailable,
    liveCounterAvailable: v.liveCounterAvailable,
  });
  // An event not filled in yet starts as a copy of the order's own venue, like on the customer's page.
  const venueOf = (key: string): EventVenueValues => values.eventVenues[key] ?? venueFromValues(values);
  const venuesForEditor = Object.fromEntries(eventSlots.map((slot) => [slot.key, venueOf(slot.key)]));
  // What the Event Information card still needs (AJ, 2026-10-18): the event type and the venue details the customer gives on the final
  // confirmation (or the team adds here). Shown on a saved order only, so a new order's blank form is not scolded.
  const orderLevelMissing: string[] = [];
  if (!values.venueType) orderLevelMissing.push("Venue Type");
  if (!values.venue.trim()) orderLevelMissing.push("Venue / Building Name");
  if (!values.eventAddress.trim()) orderLevelMissing.push("Complete Venue Address");
  if (!values.venueContactName.trim()) orderLevelMissing.push("Venue Contact Person");
  if (!values.venueContactPhone) orderLevelMissing.push("Contact Number");
  const missingEventDetails: string[] = [
    ...(values.eventTypeId ? [] : ["Event Type"]),
    ...(perEvent ? eventSlots.flatMap((slot) => { const field = missingEventVenueField(venueOf(slot.key)); return field ? [`${slot.title}: ${field}`] : []; }) : orderLevelMissing),
  ];
  const missingNotice =
    !!initialValues && missingEventDetails.length > 0 ? (
      <div role="status" className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning sm:col-span-2" data-testid="event-missing-fields">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-semibold">
            {missingEventDetails.length} event {missingEventDetails.length === 1 ? "detail is" : "details are"} still needed
          </p>
          <p>{missingEventDetails.join(" · ")}</p>
          <p className="text-xs">The customer gives the venue on the final confirmation; you can also add it here.</p>
        </div>
      </div>
    ) : null;
  function setVenuePerEvent(different: boolean) {
    setValues((prev) => {
      if (!different) return { ...prev, venuePerEvent: false };
      const seeded = { ...prev.eventVenues };
      for (const slot of eventSlots) seeded[slot.key] ??= venueFromValues(prev);
      return { ...prev, venuePerEvent: true, eventVenues: seeded };
    });
    setActiveVenueKey(eventSlots[0]?.key ?? "");
  }
  function setEventVenue<K extends keyof EventVenueValues>(key: string, field: K, value: EventVenueValues[K]) {
    setValues((prev) => ({ ...prev, eventVenues: { ...prev.eventVenues, [key]: { ...(prev.eventVenues[key] ?? venueFromValues(prev)), [field]: value } } }));
  }
  function copyEventVenue(from: string, to: string) {
    setValues((prev) => ({ ...prev, eventVenues: { ...prev.eventVenues, [to]: { ...(prev.eventVenues[from] ?? venueFromValues(prev)) } } }));
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
    // One venue for the whole order, or (a Multi Order that says it differs) one per event.
    formData.set("venuePerEvent", String(perEvent));
    if (perEvent) formData.set("eventVenues", JSON.stringify(eventSlots.map((slot) => ({ key: slot.key, details: eventVenueToInput(venueOf(slot.key)) }))));
    // New order only: the payments added on this page, recorded once the order is saved.
    if (!initialValues) formData.set("payments", JSON.stringify(draftPayments.map(({ amount, type, method, receivedAt, reference, sendReceipt }) => ({ amount, type, method, receivedAt, reference, sendReceipt }))));
    formData.set("notes", values.notes);
    formData.set("kitchenNotes", values.kitchenNotes);
    formData.set("staffingNotes", values.staffingNotes);
    const mealPlanChanged = JSON.stringify(values.mealPlanEntries) !== JSON.stringify(initialValues?.mealPlanEntries ?? []);
    // The meals belong to the Menu Approval tab once an approval exists, but the per-plate prices are edited here (Individual / Custom Pricing),
    // so a changed price sends the plan along (saved the same way, and refused once the price is frozen).
    const savedPrice = new Map((initialValues?.mealPlanEntries ?? []).map((e) => [`${e.date}|${e.mealType}`, e.price]));
    const mealPricesEdited = !priceFrozen && values.mealPlanEntries.some((e) => (savedPrice.get(`${e.date}|${e.mealType}`) ?? "") !== e.price);
    // The meals are built in the Menu Approval tab; only a changed per-plate price (Individual / Custom Pricing) sends the plan along.
    const sendMeals = mealPricesEdited;
    if (!sendMeals || (menuPlanOnlyIfChanged && !mealPlanChanged)) formData.set("mealPlanLocked", "true");
    for (const entry of sendMeals ? values.mealPlanEntries : []) {
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
    // The event type, venue location and guests can't be skipped on a new order, nor cleared on a saved one (the server checks them too).
    const blocking = orderBlockingField(
      { eventTypeId: values.eventTypeId, eventStartDate: values.eventStartDate, eventEndDate: values.eventEndDate, venue: values.venue, adultCount: values.adultCount },
      initialValues ? { eventTypeId: initialValues.eventTypeId, eventStartDate: initialValues.eventStartDate, eventEndDate: initialValues.eventEndDate, venue: initialValues.venue, adultCount: initialValues.adultCount } : null,
    );
    if (blocking) {
      setError(orderMissingMessage(blocking));
      return;
    }
    if (eventDatePast) {
      setError("Event Date can't be in the past.");
      return;
    }
    if (perEvent) {
      const index = eventSlots.findIndex((slot) => missingEventVenueField(venueOf(slot.key)) !== null);
      if (index >= 0) {
        setActiveVenueKey(eventSlots[index].key);
        setError(`Event ${index + 1}: ${missingEventVenueField(venueOf(eventSlots[index].key))} is required.`);
        return;
      }
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
    setValues((prev) => ({
      ...prev,
      individualPricingEnabled: on,
      pricingMethod: on ? "INDIVIDUAL" : "STANDARD",
      // Turning it on starts every meal at its menu's per-plate price, so nothing drops to ₹0 until it is changed.
      mealPlanEntries: on ? prev.mealPlanEntries.map((e) => (e.price.trim() === "" && e.menuId ? { ...e, price: String(menus.find((m) => m.id === e.menuId)?.price ?? "") } : e)) : prev.mealPlanEntries,
    }));
  }

  const sec = (_n: number, icon: LucideIcon) => ({ icon });

  const detailView = !!initialValues;
  // No Edit on a locked order, nor while the menu is with the customer (guests and pricing stay read-only until a recall too): one notice above the tabs says why (AJ, 2026-10-16).
  const editButton = (label: string, ariaLabel: string, onClick: () => void, frozen: boolean = locked || priceFrozen) =>
    frozen ? null : (
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
      description="Who this order is for."
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
  <FormSection {...sec(1, User)} title="Customer Details" description="Who this order is for."
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
  // When the venue differs by event, each event's venue is listed on its own instead of one set of venue fields.
  const PER_EVENT_VENUE_LABELS = new Set([
    "Venue Type", "Venue / Building Name", "Complete Venue Address", "Door / Flat / House No.", "Tower / Block", "Floor", "Landmark", "Venue Contact Person",
    "Contact Number", "Catering Access / Loading Instructions", "Cooking Instructions", "Cooking / live counter facility", "Gas / electric connection at venue",
  ]);
  const shownEventViewFields = perEvent ? eventViewFields.filter(([label]) => !PER_EVENT_VENUE_LABELS.has(label)) : eventViewFields;
  const eventSection = eventReadOnly ? (
  <FormSection
    {...sec(3, CalendarDays)}
    title="Event Information"
    description="The event, its date and where it takes place."
    action={editButton("Edit", "Edit event information", () => {
      setEventBeforeEdit(Object.fromEntries(EVENT_FIELDS.map((key) => [key, values[key]])) as Pick<OrderFormValues, (typeof EVENT_FIELDS)[number]>);
      setEditingEvent(true);
    })}
  >
    {missingNotice && <div className="mb-4">{missingNotice}</div>}
    <dl className="grid grid-cols-1 gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
      {shownEventViewFields.map(([label, value]) => {
        // A detail the card still needs reads "Not set · needed" in warning colour.
        const needed = (label === "Event Type" && !values.eventTypeId) || (!perEvent && orderLevelMissing.includes(label));
        return (
          <div key={label} className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className={cn("break-words font-medium", needed && "text-warning")} data-needed={needed || undefined}>
              {needed ? "Not set · needed" : value}
            </dd>
          </div>
        );
      })}
    </dl>
    {perEvent && (
      <div className="mt-4 flex flex-col gap-3" data-testid="event-venues-view">
        <p className="text-sm font-semibold">Venue by event</p>
        {eventSlots.map((slot) => {
          const venue = venueOf(slot.key);
          const place = eventPlace(venue);
          const address = [venue.venueDoorNumber, venue.venueTower, venue.venueFloor].filter(Boolean).join(", ");
          return (
            <div key={slot.key} className="rounded-lg border border-border p-3 text-sm">
              <p className="font-semibold">
                {slot.title}
                {slot.menuName && <span className="font-normal text-muted-foreground"> · {slot.menuName}</span>}
              </p>
              <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                {(
                  [
                    ["Venue", place ? `${place.name} (${optionLabel(VENUE_TYPE_OPTIONS, venue.venueType)})` : "Not set"],
                    ["Complete Venue Address", venue.eventAddress || "Not set"],
                    ...(address ? [["Door / Tower / Floor", address]] : []),
                    ...(venue.venueLandmark ? [["Landmark", venue.venueLandmark]] : []),
                    ["Venue Contact", [venue.venueContactName, venue.venueContactPhone].filter(Boolean).join(" · ") || "Not set"],
                    ...(venue.venueAccessInstructions ? [["Loading / Access Instructions", venue.venueAccessInstructions]] : []),
                    ...(venue.cookingInstructions ? [["Cooking Instructions", venue.cookingInstructions]] : []),
                    ["Live counter / gas & electric", `${venue.liveCounterAvailable ? "Live counter" : "No live counter"} · ${venue.gasElectricAvailable ? "Gas / electric available" : "No gas / electric"}`],
                  ] as [string, string][]
                ).map(([label, value]) => (
                  <div key={label} className="flex min-w-0 flex-col gap-0.5">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className={cn("break-words font-medium", value === "Not set" && "text-warning")} data-needed={value === "Not set" || undefined}>
                      {value === "Not set" ? "Not set · needed" : value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })}
      </div>
    )}
  </FormSection>
  ) : (
  <FormSection
    {...sec(3, CalendarDays)}
    title="Event Information"
    description="The event, its date and where it takes place."
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
      {missingNotice}
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
        <Label htmlFor="order-event-type" required>Event Type</Label>
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

      {canDiffer && <SameVenueQuestion events={eventSlots.length} sameForAll={!perEvent} onChange={(same) => setVenuePerEvent(!same)} />}
      {perEvent && (
        <EventVenuesEditor
          slots={eventSlots}
          venues={venuesForEditor}
          activeKey={eventSlots.some((slot) => slot.key === activeVenueKey) ? activeVenueKey : eventSlots[0].key}
          onActiveKey={setActiveVenueKey}
          onChange={setEventVenue}
          onCopy={copyEventVenue}
        />
      )}

      {!perEvent && (<>
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
        <Label htmlFor="order-venue" required>Venue / Building Name</Label>
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
      </>)}

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
      {!perEvent && (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-access-instructions">Catering Access / Loading Instructions</Label>
        <Textarea id="order-access-instructions" value={values.venueAccessInstructions} onChange={(e) => setField("venueAccessInstructions", e.target.value)} />
      </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-delivery-instructions">Delivery Instructions</Label>
        <Textarea id="order-delivery-instructions" value={values.deliveryInstructions} onChange={(e) => setField("deliveryInstructions", e.target.value)} />
      </div>
      {!perEvent && (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-cooking-instructions">Cooking Instructions</Label>
        <Textarea id="order-cooking-instructions" value={values.cookingInstructions} onChange={(e) => setField("cookingInstructions", e.target.value)} />
      </div>
      )}

      {!perEvent && (<>
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
      </>)}
    </div>
  </FormSection>
  );

  const guestsReadOnly = detailView && !editingGuests;
  const guestSection = guestsReadOnly ? (
  <FormSection
    {...sec(4, Users)}
    title="Guest Information"
    description="Expected guests, used for every meal."
    action={editButton("Edit", "Edit guest information", () => {
      setGuestsBeforeEdit({ adultCount: values.adultCount, childBelow5Count: values.childBelow5Count, child5To10Count: values.child5To10Count });
      setEditingGuests(true);
    }, locked || priceFrozen)}
  >
    <dl className="grid grid-cols-2 gap-4 text-sm">
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
    description="Expected guests, used for every meal."
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
    <div className="grid grid-cols-2 gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-adults" required>Adults</Label>
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
      <span className="break-words">{perEvent ? "Different for each event" : values.venue || "Not set"}</span>
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
      <Switch id="order-individual-pricing-tab" aria-label="Individual / Custom Pricing" checked={individualOn} onCheckedChange={setIndividualPricing} disabled={locked || priceFrozen} />
    </div>

    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-base font-semibold">Per Plate Pricing</h3>
        <p className="text-sm text-muted-foreground">{individualOn ? "Your price per plate for each meal." : "Each meal's per-plate price from its menu."}</p>
      </div>
      {pricedMealRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No meals yet. Build the menu in the Menu Approval tab, once the order is saved.</p>
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
        {(
          [
            { id: "order-individual-below5", label: "Children (Under 5) price", hint: "Charge for children below 5 years.", rate: "individualChildBelow5Rate", type: "individualChildBelow5PricingType" },
            { id: "order-individual-5to10", label: "Children (5–10) price", hint: "Charge for children between 5 and 10 years.", rate: "individualChild5To10Rate", type: "individualChild5To10PricingType" },
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
      {carriedOverItemsSubtotal > 0 && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Carried over from Quotation (not charged)</span>
          <span>{formatCurrency(carriedOverItemsSubtotal)}</span>
        </div>
      )}
      {below5Count + child5To10Count > 0 && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Children Charges</span>
          <span>{formatCurrency(childrenCharge)}</span>
        </div>
      )}
    </div>
    {below5Count + child5To10Count > 0 && childrenCharge === 0 && (
      <p className="flex items-start gap-2 rounded-lg bg-info/10 p-3 text-sm text-info" data-testid="children-no-rate">
        <Info className="mt-0.5 size-4 shrink-0" />
        <span>
          {childPricingMenu
            ? individualOn
              ? "No child rate is set. Enter the child prices above."
              : `${childPricingMenu.name} has no child rate set, so children are not charged. Set it on the Menu, or turn on Individual Pricing.`
            : "Children are priced from the first Menu in the order's menu. Build the menu in the Menu Approval tab to charge them."}
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
          { id: "order-transportation-cost", label: "Transportation Cost", hint: "Cost of getting the food and crew to the venue.", key: "transportationCost", modeKey: "transportationMode" },
          { id: "order-other-charges", label: "Extra / Service Cost", hint: "Any extra service charge on top of the meals.", key: "otherCharges", modeKey: "otherChargesMode" },
          { id: "order-discount", label: "Discount", hint: "Taken off the total. A percentage is of the meals and children charges.", key: "discount", modeKey: "discountMode" },
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
            ? "This is now a Multi Order. Pick a start and end date (the same day for several meals on one day); The Menu Approval tab groups each date into its own event."
            : multiNotice === "multiOff"
              ? "This is now a Single Order: one date and one meal type."
              : "You picked more than one meal type, so this is now a Multi Order, even on a single day. The Menu Approval tab groups the meals into their own events."}{" "}
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
          { label: "Total Amount", amount: mealItemsSubtotal + mealsSubtotal },
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

  /** The Save button (top right and bottom right): saves the order, or the meal plan while the Menu Approval tab is open. Nothing on a locked order. */
  const saveButton = (testId: string) =>
    onApprovalTab ? (
      approvalSave ? (
        <Button type="button" data-testid={testId} disabled={!(approvalSave.dirty || (dirty && !locked)) || approvalSave.saving || pending !== null} onClick={() => void saveAllUnsaved()}>
          {approvalSave.saving || pending === "save" ? "Saving…" : "Save changes"}
        </Button>
      ) : null
    ) : locked ? null : (
      <Button type="submit" data-testid={testId} disabled={pending !== null || !dirty}>
        {pending === "save" ? "Saving…" : submitLabel}
      </Button>
    );

  // What is unsaved, for the banner above the tabs: the order's own fields and/or the meal plan on the Menu Approval tab.
  const unsavedParts = [dirty && !locked ? "the order details" : null, approvalSave?.dirty ? "the meal plan" : null].filter((part): part is string => part !== null);
  async function saveAllUnsaved() {
    if (approvalSave?.dirty) await approvalSave.save();
    if (dirty && !locked) await handleSubmit(false);
  }

  const tabs: FormTab[] = [
    {
      id: "details",
      label: "Order Details",
      // Customer and guests side by side, the event below them, then (before a menu approval exists) the menu planner, which is the only place to enter meals then.
      panel: (
        <>
          <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2 [&>*]:h-full [&>fieldset>*]:h-full">
            {freeze(customerSection, locked || priceFrozen)}
            {freeze(guestSection, locked || priceFrozen)}
          </div>
          {freeze(eventSection, locked || priceFrozen)}
          {multiDialog}
          {detailsExtra}
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
    ...(!showPrices ? [] : [{
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
    }]),
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
    // Last tab (AJ, 2026-10-16).
    { id: "additional", label: "Additional Details", panel: freeze(additionalSection) },
  ];

  return (
    <LiveOrderTotalProvider value={initialValues && dirty ? total : null}>
    <OrderPriceLinesProvider value={priceLines}>
    <ApprovalSidebarSlotProvider value={approvalSlot}>
    <ApprovalSavePublisherProvider value={setApprovalSave}>
    <UnsavedOrderEditsProvider value={Boolean(initialValues) && dirty}>
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
            {/* Save sits top right here and bottom right under the cards (AJ, 2026-10-16); the Menu Approval tab has its own Save Changes. */}
            {saveButton("order-save-top")}
          </div>
        </div>
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

        {priceFrozen && !locked && (
          <div role="status" className="flex items-start gap-3 rounded-xl border border-info/30 bg-info/10 p-4 text-sm" data-testid="order-frozen-banner">
            <Lock className="mt-0.5 size-4 shrink-0 text-info" />
            <div>
              <p className="font-semibold">{withCustomer ? "The menu is with the customer, so the order is read-only." : "The customer has approved the menu, so customer details, event information, guests and pricing are read-only."}</p>
              <p className="text-muted-foreground">
                Customer details, event information, guests and pricing can&apos;t be changed. Recall the menu in the Menu Approval tab to edit them; the customer then approves the new version.
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
            {showPrices && activeTab === "pricing" && sidebarInvoiceAction}
            {/* The Menu Approval tab puts its Menu Status, Notes, history and pricing cards here (order-menu-approval-tab.tsx). */}
            {menuApprovalTab && <div ref={setApprovalSlot} id="order-approval-sidebar" className={activeTab === "approval" ? "flex min-w-0 flex-col gap-4" : "hidden"} />}
            {/* The Menu Approval tab has its own four cards and its own Save Changes, so the order's summary, pricing and Save card step aside there. */}
            <div className={onApprovalTab ? "hidden" : "contents"}>
              {statusCard}
              {sidebarTop ?? orderSummaryCard}
              {!sidebarTop && showPrices && pricingSummaryCard}
            </div>
          </aside>
        </div>
        {(onApprovalTab ? approvalSave : !locked) && (
          <div className="flex items-center justify-end gap-3" data-testid="order-save-bottom">
            {saveButton("order-save-bottom-button")}
          </div>
        )}

        {unsavedParts.length > 0 && (
          // Stays at the bottom of the screen on every tab and while scrolling (AJ, 2026-10-16): edits made on one tab used to look saved once another tab was open.
          <div role="status" className="sticky bottom-6 z-20 mx-auto flex w-fit max-w-full flex-wrap items-center justify-center gap-x-5 gap-y-2 rounded-xl border border-warning/50 bg-card py-2.5 pr-3 pl-4 shadow-lg ring-4 ring-warning/10" data-testid="unsaved-note">
            <p className="flex min-w-0 items-start gap-2 text-sm font-medium text-warning">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                Unsaved changes in {unsavedParts.join(" and ")}. <span className="font-normal">Save them before you leave.</span>
              </span>
            </p>
            <Button type="button" size="md" data-testid="unsaved-note-save" disabled={pending !== null || Boolean(approvalSave?.saving)} onClick={() => void saveAllUnsaved()}>
              {pending === "save" || approvalSave?.saving ? "Saving…" : initialValues ? "Save changes" : submitLabel}
            </Button>
          </div>
        )}
      </form>
      {guard.dialog}
    </UnsavedOrderEditsProvider>
    </ApprovalSavePublisherProvider>
    </ApprovalSidebarSlotProvider>
    </OrderPriceLinesProvider>
    </LiveOrderTotalProvider>
  );
}
