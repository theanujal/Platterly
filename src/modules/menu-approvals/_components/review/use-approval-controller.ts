"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { MealSelection } from "@/components/catalog/menu-planning-section";
import { priceMeals } from "@/modules/orders/meal-pricing";
import { reviewTotals } from "@/modules/menu-approvals/review-totals";
import { snapshotHasDishIds } from "@/modules/menu-approvals/snapshot-meals";
import type { MenuSelectionStatus } from "@/generated/prisma/enums";
import { EDITABLE_STATUSES, WITH_CUSTOMER } from "./approval-format";
import type { ApprovalPending, FoodDialogTarget, MenuApprovalReviewProps, ReviewActions } from "./types";

/** Where "view version N" and "back to current" go. Handed in so the review never hard-codes the page it sits on. */
export interface ReviewNavigation {
  openVersion(versionNumber: number): void;
  backToCurrent(): void;
}

/**
 * All the state and handlers of one menu approval's review (moved unchanged from menu-approval-review.tsx): the planner draft,
 * the price and note fields, the pending action and its error, and the live pricing. Every change goes through the `actions`
 * passed in; this hook adds no server calls and no rules of its own.
 */
export function useApprovalController({ data, actions, navigation }: { data: MenuApprovalReviewProps; actions: ReviewActions; navigation: ReviewNavigation }) {
  const {
    menuSelectionId,
    status,
    customPricePerPlate,
    pricing,
    menuPreference: initialPreference,
    entries: initialEntries,
    menus,
    versions,
    approvalUrl,
    viewVersion,
  } = data;
  const router = useRouter();
  const [entries, setEntries] = useState<MealSelection[]>(initialEntries);
  const [dirty, setDirty] = useState(false);
  const [menuPreference, setMenuPreference] = useState(initialPreference);
  const [foodDialogTarget, setFoodDialogTarget] = useState<FoodDialogTarget>(null);
  const [pricePerPlate, setPricePerPlate] = useState(customPricePerPlate === null ? "" : String(customPricePerPlate));
  const [noteDraft, setNoteDraft] = useState("");
  const [compareOn, setCompareOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<ApprovalPending>(null);
  const [sentUrl, setSentUrl] = useState<string | null>(null);

  const editable = EDITABLE_STATUSES.includes(status);
  const withCustomer = WITH_CUSTOMER.includes(status);
  const liveUrl = sentUrl ?? approvalUrl;

  // ---- version view: a frozen version, read-only, in the same planner ----
  const shownVersion = viewVersion === null ? null : (versions.find((v) => v.versionNumber === viewVersion) ?? null);
  const versionHasDishIds = shownVersion?.snapshot ? snapshotHasDishIds(shownVersion.snapshot) : false;

  function openVersion(versionNumber: number) {
    navigation.openVersion(versionNumber);
  }
  function backToCurrent() {
    setCompareOn(false);
    navigation.backToCurrent();
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
            quantity: item.perGuest ? Math.max(pricing.menuGuests, 1) : 1,
            isExtra: item.itemType === "MENU_ITEM" && item.perGuest,
          })),
        })),
        pricing.individualPricingEnabled,
        pricing.menuGuests,
      ),
    [entries, menus, pricing],
  );
  // Resolved against the draft's subtotal (meals + children) the way the server does it, so a percentage Discount, Extra / Service Cost,
  // Transportation or team line follows the meals. With no unsaved edits the figures are the order's own, so the card always agrees
  // with the order's Pricing & Payment tab.
  const { chargesAndDiscount: liveChargesAndDiscount, total: liveTotal } = reviewTotals(priced.mealsSubtotal, pricing);
  const showSaved = !dirty;
  const shownPriced = showSaved ? { menuAmount: pricing.saved.menuAmount, extrasAmount: pricing.saved.extrasAmount } : priced;
  const chargesAndDiscount = showSaved ? pricing.saved.chargesAndDiscount : liveChargesAndDiscount;
  const total = showSaved ? pricing.saved.total : liveTotal;
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
        quantity: item.perGuest ? Math.max(pricing.menuGuests, 1) : 1,
        isExtra: item.itemType === "MENU_ITEM" && item.perGuest,
      })),
    }));
  }

  async function savePlan() {
    if (entries.length === 0) {
      setError("Select at least one meal.");
      return false;
    }
    if (!dirty) return true;
    const emptyMeal = entries.find((e) => e.menuId && !e.items.some((i) => i.itemType === "MENU_ITEM"));
    if (emptyMeal) {
      setError(`Select food items for ${emptyMeal.mealType.toLowerCase()} on ${emptyMeal.date}, or remove the meal.`);
      return false;
    }
    const result = await actions.saveMealPlan(menuSelectionId, planPayload());
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
    const result = await actions.send(menuSelectionId);
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
    const result = await actions.recall(menuSelectionId);
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
    const result = await actions.approveAndSendToKitchen(menuSelectionId);
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
    const result = await actions.setCustomPrice(menuSelectionId, value);
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  /** Resolves true when the note was saved, so the notes card can close its box. */
  async function handleAddNote() {
    setError(null);
    setPending("note");
    const result = await actions.addNote(menuSelectionId, noteDraft);
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    setNoteDraft("");
    router.refresh();
    return true;
  }

  async function handleChangeStatus(value: string, reason: string) {
    return actions.changeStatus(menuSelectionId, value as MenuSelectionStatus, reason);
  }

  const quotedAmount = pricePerPlate.trim() !== "" && Number.isFinite(Number(pricePerPlate)) ? Number(pricePerPlate) * pricing.menuGuests : null;

  return {
    // state
    entries,
    dirty,
    menuPreference,
    foodDialogTarget,
    pricePerPlate,
    noteDraft,
    compareOn,
    error,
    pending,
    // derived
    editable,
    withCustomer,
    liveUrl,
    shownVersion,
    versionHasDishIds,
    priced: shownPriced,
    chargesAndDiscount,
    total,
    lastSentTotal,
    sinceLastSent,
    quotedAmount,
    // setters the planner and fields use
    setEntries: (next: MealSelection[]) => {
      setEntries(next);
      setDirty(true);
    },
    setMenuPreference,
    setFoodDialogTarget,
    setPricePerPlate,
    setNoteDraft,
    toggleCompare: () => setCompareOn((v) => !v),
    // handlers
    openVersion,
    backToCurrent,
    handleSave,
    handleSend,
    handleRecall,
    handleApprove,
    handleSavePrice,
    handleAddNote,
    handleChangeStatus,
  };
}

export type ApprovalController = ReturnType<typeof useApprovalController>;
