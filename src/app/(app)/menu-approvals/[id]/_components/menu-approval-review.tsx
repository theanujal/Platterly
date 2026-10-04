"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChefHat,
  ExternalLink,
  Eye,
  History,
  MessageSquareText,
  Send,
  ShoppingBasket,
  Tag,
  Undo2,
  UtensilsCrossed,
  Users,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { MenuPlanningSection, type MealSelection, type MealTypeValue, type MenuOption } from "@/components/catalog/menu-planning-section";
import { FormSection, SummaryCard } from "../../../orders/_components/order-form-parts";
import { priceMeals } from "@/modules/orders/meal-pricing";
import { compareMealPlans, snapshotHasDishIds, snapshotToMealSelections } from "@/modules/menu-approvals/snapshot-meals";
import type { ApprovalSnapshot } from "@/modules/menu-approvals/approval-snapshot";
import {
  MENU_SELECTION_STATUS_HINT,
  MENU_SELECTION_STATUS_LABEL,
  MENU_SELECTION_STATUS_ORDER,
  MENU_SELECTION_STATUS_TONE,
} from "@/modules/orders/order-status";
import { StatusPanel, type StatusHistoryEntry } from "../../../orders/_components/status-panel";
import type { MenuSelectionStatus } from "@/generated/prisma/enums";
import {
  addMenuApprovalNoteAction,
  getMenuForApprovalPickerAction,
  approveAndSendToKitchenAction,
  changeMenuStatusAction,
  recallMenuAction,
  sendMenuForApprovalAction,
  setCustomMenuPriceAction,
  updateMenuApprovalMealPlanAction,
} from "../../actions";

interface NoteView {
  id: string;
  authorType: "CUSTOMER" | "KITCHEN" | "TEAM";
  authorName: string | null;
  body: string;
  versionNumber: number | null;
  createdAt: Date;
}

interface VersionView {
  versionNumber: number;
  createdAt: Date;
  sentAt: Date | null;
  /** Set once a newer version was sent (or the menu was recalled): this version can no longer be approved. */
  superseded: boolean;
  snapshot: ApprovalSnapshot | null;
}

interface MenuApprovalReviewProps {
  menuSelectionId: string;
  status: MenuSelectionStatus;
  statusLabel: string;
  currentVersion: number;
  lockedAt: Date | null;
  isCustomMenu: boolean;
  customPricePerPlate: number | null;
  header: {
    orderId: string;
    orderNumber: string | null;
    customer: string;
    eventType: string | null;
    eventDate: string;
    guests: number;
    kitchen: string | null;
    /** Opening the order needs orders:edit. */
    canOpenOrder: boolean;
  };
  pricing: {
    individualPricingEnabled: boolean;
    /** The guests the menu price applies to (adults). */
    menuGuests: number;
    /** Every guest, children included: what an Extra dish or a per-plate add-on is charged for. */
    totalGuests: number;
    childrenCharge: number;
    discount: number;
    transportationCost: number;
    otherCharges: number;
  };
  menuPreference: string;
  days: string[];
  entries: MealSelection[];
  menus: MenuOption[];
  notes: NoteView[];
  versions: VersionView[];
  statusHistory: StatusHistoryEntry[];
  /** The live customer link: while the menu awaits the customer, and after approval (it then carries the venue form), else null. */
  approvalUrl: string | null;
  /** ISO time the customer sent the Venue & Delivery details on that link, or null. */
  venueDetailsSubmittedAt: string | null;
  /** Set from ?version=N: show that frozen version, read-only. */
  viewVersion: number | null;
}

// The team edits a menu only while no version of it is with the customer, approved or with the kitchen
// (mirrors EDITABLE_STATUSES in menu-approval.ts, which enforces it server-side).
const EDITABLE_STATUSES: MenuSelectionStatus[] = ["DRAFT", "CHANGES_REQUESTED"];
const WITH_CUSTOMER: MenuSelectionStatus[] = ["SENT_TO_CUSTOMER", "CUSTOMER_REVIEWING"];

const AUTHOR_LABEL = { CUSTOMER: "Customer", KITCHEN: "Kitchen", TEAM: "Team" } as const;
const AUTHOR_TONE = { CUSTOMER: "info", KITCHEN: "warning", TEAM: "neutral" } as const;

function formatCurrency(amount: number) {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateTime(date: Date) {
  return new Date(date).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** The stage banner under the header: what is going on and what the team does next. */
function stageBanner(status: MenuSelectionStatus, currentVersion: number, statusLabel: string) {
  switch (status) {
    case "CHANGES_REQUESTED":
      return {
        tone: "danger" as const,
        text: "The customer requested changes. Update the menu, then send a new version for approval.",
        noteLink: "View Customer Note",
      };
    case "DRAFT":
      return { tone: "neutral" as const, text: "Check the dishes and the guest count, then send the menu to the customer for approval.", noteLink: null };
    case "SENT_TO_CUSTOMER":
    case "CUSTOMER_REVIEWING":
      return { tone: "info" as const, text: `Version ${currentVersion} is with the customer — ${statusLabel}`, noteLink: null };
    case "CUSTOMER_APPROVED":
      return {
        tone: "info" as const,
        text: `The customer approved version ${currentVersion}. Send it to the kitchen when everything is ready, or recall it to change something.`,
        noteLink: null,
      };
    default:
      return null;
  }
}

const BANNER_CLASS = {
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
  info: "border-info/30 bg-info/10 text-info",
  neutral: "border-border bg-muted text-muted-foreground",
} as const;

export function MenuApprovalReview({
  menuSelectionId,
  status,
  statusLabel,
  currentVersion,
  lockedAt,
  isCustomMenu,
  customPricePerPlate,
  header,
  pricing,
  menuPreference: initialPreference,
  days,
  entries: initialEntries,
  menus,
  notes,
  versions,
  statusHistory,
  approvalUrl,
  venueDetailsSubmittedAt,
  viewVersion,
}: MenuApprovalReviewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [entries, setEntries] = useState<MealSelection[]>(initialEntries);
  const [dirty, setDirty] = useState(false);
  const [menuPreference, setMenuPreference] = useState(initialPreference);
  const [foodDialogTarget, setFoodDialogTarget] = useState<{ date: string; mealType: MealTypeValue } | null>(null);
  const [pricePerPlate, setPricePerPlate] = useState(customPricePerPlate === null ? "" : String(customPricePerPlate));
  const [noteDraft, setNoteDraft] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [compareOn, setCompareOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"save" | "approve" | "send" | "recall" | "price" | "note" | null>(null);
  const [sentUrl, setSentUrl] = useState<string | null>(null);

  const editable = EDITABLE_STATUSES.includes(status);
  const withCustomer = WITH_CUSTOMER.includes(status);
  const liveUrl = sentUrl ?? approvalUrl;
  const banner = stageBanner(status, currentVersion, statusLabel);

  // ---- version view: a frozen version, read-only, in the same planner ----
  const shownVersion = viewVersion === null ? null : (versions.find((v) => v.versionNumber === viewVersion) ?? null);
  const versionEntries = useMemo(() => (shownVersion?.snapshot ? snapshotToMealSelections(shownVersion.snapshot) : []), [shownVersion]);
  const versionHasDishIds = shownVersion?.snapshot ? snapshotHasDishIds(shownVersion.snapshot) : false;
  const versionDays = useMemo(() => [...new Set(versionEntries.map((e) => e.date))].sort(), [versionEntries]);
  const versionMenus = useMemo(() => {
    const known = new Set(menus.map((m) => m.id));
    const extra: MenuOption[] = (shownVersion?.snapshot?.meals ?? [])
      .filter((m) => m.menuId && !known.has(m.menuId))
      .map((m) => ({
        id: m.menuId as string,
        name: m.menuName ?? "Menu",
        menuType: "VEGETARIAN",
        price: 0,
        childUnder5Chargeable: false,
        childUnder5Price: null,
        child5To10PricingType: "FIXED",
        child5To10PriceValue: null,
      }));
    return [...menus, ...extra];
  }, [menus, shownVersion]);
  const compareMarks = useMemo(
    () =>
      shownVersion && compareOn && versionHasDishIds
        ? compareMealPlans(versionEntries, initialEntries, { highlight: "Not in current", missing: "Added since" })
        : undefined,
    [shownVersion, compareOn, versionHasDishIds, versionEntries, initialEntries],
  );

  function openVersion(versionNumber: number) {
    setHistoryOpen(false);
    router.push(`${pathname}?version=${versionNumber}`);
  }
  function backToCurrent() {
    setCompareOn(false);
    router.push(pathname);
  }

  // ---- live pricing, by the one rule (meal-pricing.ts) ----
  const priced = useMemo(
    () =>
      priceMeals(
        entries.map((e) => ({
          price: e.price.trim() === "" ? null : Number.parseFloat(e.price) || 0,
          menuPricePerPlate: menus.find((m) => m.id === e.menuId)?.price ?? null,
          items: e.items.map((item) => ({
            itemType: item.itemType,
            unitPrice: item.unitPrice,
            quantity: item.perGuest ? Math.max(pricing.totalGuests, 1) : 1,
            isExtra: item.itemType === "MENU_ITEM" && item.perGuest,
          })),
        })),
        pricing.individualPricingEnabled,
        pricing.menuGuests,
      ),
    [entries, menus, pricing],
  );
  const chargesAndDiscount = pricing.transportationCost + pricing.otherCharges - pricing.discount;
  const total = priced.mealsSubtotal + pricing.childrenCharge + chargesAndDiscount;
  const lastSent = versions.find((v) => !v.superseded) ?? versions[0] ?? null;
  const lastSentTotal = lastSent?.snapshot?.total ?? null;
  const sinceLastSent = lastSentTotal === null ? null : total - lastSentTotal;

  function planPayload() {
    return entries.map((e) => ({
      date: e.date,
      mealType: e.mealType,
      price: e.price.trim() === "" ? null : Number.parseFloat(e.price) || 0,
      menuId: e.menuId || null,
      items: e.items.map((item) => ({
        itemType: item.itemType,
        catalogId: item.catalogId,
        quantity: item.perGuest ? Math.max(pricing.totalGuests, 1) : 1,
        isExtra: item.itemType === "MENU_ITEM" && item.perGuest,
      })),
    }));
  }

  async function savePlan() {
    if (!dirty) return true;
    const emptyMeal = entries.find((e) => e.menuId && !e.items.some((i) => i.itemType === "MENU_ITEM"));
    if (emptyMeal) {
      setError(`Select food items for ${emptyMeal.mealType.toLowerCase()} on ${emptyMeal.date}, or remove the meal.`);
      return false;
    }
    const result = await updateMenuApprovalMealPlanAction(menuSelectionId, planPayload());
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    setDirty(false);
    return true;
  }

  async function handleSave() {
    setError(null);
    setPending("save");
    const ok = await savePlan();
    setPending(null);
    if (ok) router.refresh();
  }

  async function handleSend() {
    setError(null);
    setPending("send");
    if (!(await savePlan())) {
      setPending(null);
      return;
    }
    const result = await sendMenuForApprovalAction({ menuSelectionId });
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSentUrl(result.url);
    router.refresh();
  }

  async function handleRecall() {
    setError(null);
    setPending("recall");
    const result = await recallMenuAction(menuSelectionId);
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSentUrl(null);
    router.refresh();
  }

  async function handleApprove() {
    setError(null);
    setPending("approve");
    const result = await approveAndSendToKitchenAction(menuSelectionId);
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleSavePrice() {
    setError(null);
    const value = Number(pricePerPlate);
    if (pricePerPlate.trim() === "" || !Number.isFinite(value) || value < 0) {
      setError("Enter a price per plate of zero or more.");
      return;
    }
    setPending("price");
    const result = await setCustomMenuPriceAction(menuSelectionId, value);
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleAddNote() {
    setError(null);
    setPending("note");
    const result = await addMenuApprovalNoteAction(menuSelectionId, noteDraft);
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNoteDraft("");
    router.refresh();
  }

  const quotedAmount = pricePerPlate.trim() !== "" && Number.isFinite(Number(pricePerPlate)) ? Number(pricePerPlate) * pricing.menuGuests : null;
  const notesNewestFirst = [...notes].reverse();
  const latestVersions = versions.slice(0, 2);
  // A Custom Menu's dishes come from the open dish list, which the planner's per-menu picker can't edit, so it is shown as is.
  const planReadOnly = !editable || isCustomMenu;

  return (
    <div className="flex flex-col gap-6">
      <PageBreadcrumb
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Menu Approvals", href: "/menu-approvals" },
          { label: header.orderNumber ?? header.customer },
        ]}
      />

      {/* ---------------- Header: title left, stage actions right ---------------- */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">{header.orderNumber ?? "Menu Approval"}</h1>
            <Badge variant={MENU_SELECTION_STATUS_TONE[status]}>{statusLabel}</Badge>
          </div>
          <p className="text-base font-medium">Menu for {header.customer}</p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
            {header.eventType && (
              <span className="flex items-center gap-1.5">
                <Tag className="size-4" />
                {header.eventType}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-4" />
              {header.eventDate}
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="size-4" />
              {header.guests} Guests
            </span>
            <span className="flex items-center gap-1.5">
              <ChefHat className="size-4" />
              {header.kitchen ?? "No kitchen assigned"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2" data-testid="menu-approval-actions">
          {header.canOpenOrder && (
            <Button variant="outline" render={<Link href={`/orders/${header.orderId}`} />} nativeButton={false}>
              View Order
              <ExternalLink data-icon="inline-end" />
            </Button>
          )}
          {!shownVersion && editable && (
            <>
              <Button type="button" variant="outline" disabled={pending !== null || !dirty} onClick={handleSave}>
                {pending === "save" ? "Saving…" : "Save Changes"}
              </Button>
              <Button type="button" disabled={pending !== null} onClick={handleSend}>
                <Send data-icon="inline-start" />
                {pending === "send" ? "Sending…" : versions.length > 0 ? "Send Updated Menu for Approval" : "Send Menu for Approval"}
              </Button>
            </>
          )}
          {!shownVersion && withCustomer && (
            <Button type="button" variant="outline" disabled={pending !== null} onClick={handleRecall}>
              <Undo2 data-icon="inline-start" />
              {pending === "recall" ? "Recalling…" : "Recall to Edit"}
            </Button>
          )}
          {!shownVersion && status === "CUSTOMER_APPROVED" && (
            <>
              <Button type="button" variant="outline" disabled={pending !== null} onClick={handleRecall}>
                <Undo2 data-icon="inline-start" />
                {pending === "recall" ? "Recalling…" : "Recall to Edit"}
              </Button>
              <Button type="button" disabled={pending !== null} onClick={handleApprove}>
                {pending === "approve" ? "Sending…" : "Approve & Send to Kitchen"}
              </Button>
            </>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {/* ---------------- Stage banner ---------------- */}
      {!shownVersion && banner && (
        <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-sm ${BANNER_CLASS[banner.tone]}`}>
          <span className="flex items-start gap-2 font-medium">
            {banner.tone === "danger" && <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
            {banner.text}
          </span>
          {banner.noteLink && (
            <a href="#menu-notes" className="flex items-center gap-1 font-medium whitespace-nowrap hover:underline">
              {banner.noteLink}
              <ArrowRight className="size-4" />
            </a>
          )}
        </div>
      )}
      {!shownVersion && withCustomer && liveUrl && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3 text-sm">
          <span className="text-muted-foreground">Customer link:</span>
          <code className="max-w-full truncate rounded bg-muted px-2 py-1 text-xs">{liveUrl}</code>
          <CopyButton value={liveUrl} label="Copy link" size="md" />
        </div>
      )}
      {!shownVersion && (status === "CUSTOMER_APPROVED" || status === "FINAL_LOCKED") && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3 text-sm" data-testid="venue-details-status">
          <span className="font-medium">Venue &amp; delivery details:</span>
          {venueDetailsSubmittedAt ? (
            <Badge variant="success">Received {formatDateTime(new Date(venueDetailsSubmittedAt))}</Badge>
          ) : (
            <>
              <Badge variant="warning">Waiting for the customer</Badge>
              {liveUrl && (
                <>
                  <code className="max-w-full truncate rounded bg-muted px-2 py-1 text-xs">{liveUrl}</code>
                  <CopyButton value={liveUrl} label="Copy link" size="md" />
                </>
              )}
            </>
          )}
        </div>
      )}
      {!shownVersion && status === "FINAL_LOCKED" && lockedAt && (
        <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          Approved and sent to the kitchen on {formatDateTime(lockedAt)} — no further changes.
        </div>
      )}
      {viewVersion !== null && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
          <span className="flex items-center gap-2 font-medium text-warning">
            <Eye className="size-4" />
            {shownVersion
              ? `Viewing Version ${shownVersion.versionNumber}${shownVersion.sentAt ? `, sent ${formatDateTime(shownVersion.sentAt)}` : ""} — read only`
              : `Version ${viewVersion} wasn't found.`}
          </span>
          <span className="flex flex-wrap items-center gap-2">
            {shownVersion && (
              <Button
                type="button"
                variant={compareOn ? "default" : "outline"}
                size="md"
                disabled={!versionHasDishIds}
                aria-pressed={compareOn}
                onClick={() => setCompareOn((v) => !v)}
              >
                {compareOn ? "Hide Compare" : "Compare with current"}
              </Button>
            )}
            <Button type="button" variant="outline" size="md" onClick={backToCurrent}>
              <ArrowLeft data-icon="inline-start" />
              Back to current
            </Button>
          </span>
        </div>
      )}
      {shownVersion && !versionHasDishIds && (
        <p className="text-xs text-muted-foreground">
          This version was sent before dishes were saved by id, so it can be viewed but not compared dish by dish.
        </p>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* ---------------- Main column: the same Menu Planning as the order ---------------- */}
        <div className="flex min-w-0 flex-col gap-4">
          {isCustomMenu && !shownVersion && (
            <FormSection
              icon={Wallet}
              title="Quote the price per plate"
              description="The customer picked their own dishes and saw no price. Enter your per-plate quote — it becomes this order's menu amount."
            >
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ma-price">Price per plate (₹)</Label>
                  <Input id="ma-price" type="number" min={0} className="w-40" value={pricePerPlate} onChange={(e) => setPricePerPlate(e.target.value)} />
                </div>
                <Button type="button" size="md" disabled={pending !== null} onClick={handleSavePrice}>
                  {pending === "price" ? "Saving…" : "Save price"}
                </Button>
                {quotedAmount !== null && (
                  <span className="pb-2 text-sm text-muted-foreground">
                    = {formatCurrency(quotedAmount)} for {pricing.menuGuests} guests
                  </span>
                )}
              </div>
            </FormSection>
          )}

          <FormSection
            icon={UtensilsCrossed}
            title="Menu Planning"
            description={
              shownVersion
                ? `Version ${shownVersion.versionNumber} as it was sent to the customer.`
                : editable
                  ? isCustomMenu
                    ? "The customer's own dishes. Edit the price above."
                    : "Add, change or remove meals and dishes. Changes update the order as soon as you save."
                  : "The menu on this order. It is locked while it is with the customer or the kitchen."
            }
          >
            {shownVersion ? (
              shownVersion.snapshot && shownVersion.snapshot.meals.length > 0 ? (
                <MenuPlanningSection
                  idPrefix="approval-version"
                  days={versionDays}
                  mealPlanEntries={versionEntries}
                  onChange={() => {}}
                  menus={versionMenus}
                  menuPreference=""
                  onMenuPreferenceChange={() => {}}
                  individualPricingEnabled={pricing.individualPricingEnabled}
                  guestsForPricing={pricing.totalGuests}
                  loadPickerData={getMenuForApprovalPickerAction}
                  foodDialogTarget={null}
                  onOpenFoodDialog={() => {}}
                  onCloseFoodDialog={() => {}}
                  readOnly
                  compare={compareMarks}
                />
              ) : (
                <p className="text-sm text-muted-foreground">This version has no per-meal details saved.</p>
              )
            ) : (
              <MenuPlanningSection
                idPrefix="approval"
                days={days}
                mealPlanEntries={entries}
                onChange={(next) => {
                  setEntries(next);
                  setDirty(true);
                }}
                menus={menus}
                menuPreference={menuPreference}
                onMenuPreferenceChange={setMenuPreference}
                individualPricingEnabled={pricing.individualPricingEnabled}
                guestsForPricing={pricing.totalGuests}
                loadPickerData={getMenuForApprovalPickerAction}
                foodDialogTarget={foodDialogTarget}
                onOpenFoodDialog={(date, mealType) => setFoodDialogTarget({ date, mealType })}
                onCloseFoodDialog={() => setFoodDialogTarget(null)}
                readOnly={planReadOnly}
              />
            )}
          </FormSection>
        </div>

        {/* ---------------- Sidebar: status, notes, history, pricing ---------------- */}
        <aside className="flex min-w-0 flex-col gap-4">
          <StatusPanel
            idPrefix="menu-status"
            title="Menu Status"
            icon={ShoppingBasket}
            currentLabel={statusLabel}
            currentTone={MENU_SELECTION_STATUS_TONE[status]}
            hint={MENU_SELECTION_STATUS_HINT[status]}
            extra={`Version ${currentVersion}`}
            options={MENU_SELECTION_STATUS_ORDER.map((value) => ({ value, label: MENU_SELECTION_STATUS_LABEL[value] }))}
            currentValue={status}
            canChange
            onChange={(value, reason) => changeMenuStatusAction(menuSelectionId, value as MenuSelectionStatus, reason)}
            history={statusHistory}
          />

          <Card id="menu-notes" className="scroll-mt-6 gap-4 px-5 [--card-spacing:--spacing(5)]" data-testid="menu-notes-card">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <MessageSquareText className="size-5" />
              </span>
              <h2 className="min-w-0 flex-1 text-base font-semibold">Notes</h2>
              <Badge variant="neutral">{notes.length}</Badge>
            </div>
            {notes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No notes yet. Customer and kitchen requests land here, and you can add your own.</p>
            ) : (
              <ul className="flex max-h-96 flex-col gap-3 overflow-y-auto">
                {notesNewestFirst.map((note) => (
                  <li key={note.id} className="flex flex-col gap-1.5 rounded-lg bg-muted p-3 text-sm" data-testid="menu-note">
                    <p className="whitespace-pre-wrap">{note.body}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant={AUTHOR_TONE[note.authorType]}>{AUTHOR_LABEL[note.authorType]}</Badge>
                      {note.authorName && <span>{note.authorName}</span>}
                      {note.versionNumber !== null && <span>· Version {note.versionNumber}</span>}
                      <span>· {formatDateTime(note.createdAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="ma-add-note" className="sr-only">
                Add a note
              </Label>
              <Textarea id="ma-add-note" placeholder="Add a note for the team…" value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} />
              <Button
                type="button"
                variant="outline"
                size="md"
                className="self-end"
                disabled={pending !== null || noteDraft.trim() === ""}
                onClick={handleAddNote}
              >
                {pending === "note" ? "Adding…" : "Add Note"}
              </Button>
            </div>
          </Card>

          <Card className="gap-4 px-5 [--card-spacing:--spacing(5)]" data-testid="menu-history-card">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <History className="size-5" />
              </span>
              <h2 className="min-w-0 flex-1 text-base font-semibold">Menu History</h2>
              {versions.length > 2 && (
                <Button type="button" variant="link" size="sm" className="px-0 text-info" onClick={() => setHistoryOpen(true)}>
                  View All
                </Button>
              )}
            </div>
            {latestVersions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Version {currentVersion} hasn&apos;t been sent to the customer yet.</p>
            ) : (
              <ol className="flex flex-col" aria-label="Menu version history">
                {latestVersions.map((version, index) => {
                  const isLatest = index === 0;
                  const isLast = index === latestVersions.length - 1;
                  const viewing = viewVersion === version.versionNumber;
                  return (
                    <li key={version.versionNumber} className="flex gap-3 text-sm" data-testid="menu-version-summary">
                      <div className="flex flex-col items-center pt-1.5">
                        <span className={`size-3 shrink-0 rounded-full ${isLatest ? "bg-primary" : "bg-primary/60"}`} />
                        {!isLast && <span className="my-1 w-0.5 flex-1 bg-border" />}
                      </div>
                      <div className={`flex min-w-0 flex-1 flex-col gap-0.5 ${isLast ? "" : "pb-4"}`}>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openVersion(version.versionNumber)}
                            className={`font-semibold hover:underline ${viewing ? "text-primary" : ""}`}
                            aria-label={`View version ${version.versionNumber}`}
                          >
                            Version {version.versionNumber}
                          </button>
                          {version.superseded ? (
                            <Badge variant="neutral">Superseded</Badge>
                          ) : (
                            <Badge variant={MENU_SELECTION_STATUS_TONE[status]}>{statusLabel}</Badge>
                          )}
                        </div>
                        <span className="text-muted-foreground">Sent on {formatDateTime(version.sentAt ?? version.createdAt)}</span>
                        {version.snapshot && <span className="text-xs text-muted-foreground">{formatCurrency(version.snapshot.total)}</span>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>

          <SummaryCard icon={Wallet} title="Pricing Details">
            <div className="flex flex-col gap-3 text-sm">
              {[
                { label: "Menu Amount", amount: priced.menuAmount },
                { label: "Extras & Add-ons", amount: priced.extrasAmount },
                { label: "Children Charges", amount: pricing.childrenCharge },
                { label: "Charges & Discount", amount: chargesAndDiscount },
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
            {sinceLastSent !== null && (
              <p className="text-xs text-muted-foreground">
                {sinceLastSent === 0
                  ? "Same as the last version sent."
                  : `${sinceLastSent > 0 ? "+" : "−"}${formatCurrency(Math.abs(sinceLastSent))} since the last version sent (${formatCurrency(lastSentTotal ?? 0)}).`}
              </p>
            )}
            {dirty && <p className="text-xs text-warning">Unsaved changes. Save to update the order.</p>}
          </SummaryCard>
        </aside>
      </div>

      {/* All versions, each one opens in the planner */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Menu version history</DialogTitle>
            <DialogDescription>
              Every time the menu is sent to the customer, that version is saved as it was sent. Open one to see it in the planner.
            </DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
            {versions.map((version) => (
              <div key={version.versionNumber} className="flex flex-col gap-1.5 rounded-lg border border-border p-3 text-sm" data-testid="menu-version-row">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-medium">
                    Version {version.versionNumber}
                    {version.versionNumber === currentVersion && <span className="text-xs font-normal text-muted-foreground">Current</span>}
                  </span>
                  {version.superseded ? <Badge variant="neutral">Replaced</Badge> : <Badge variant={MENU_SELECTION_STATUS_TONE[status]}>{statusLabel}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                  Sent {formatDateTime(version.sentAt ?? version.createdAt)}
                  {version.snapshot ? ` · ${formatCurrency(version.snapshot.total)}` : ""}
                </p>
                <Button type="button" variant="outline" size="md" className="w-fit" onClick={() => openVersion(version.versionNumber)}>
                  <Eye data-icon="inline-start" />
                  View version
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
