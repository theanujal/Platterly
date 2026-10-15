import type { MealSelection, MealTypeValue, MenuOption } from "@/components/catalog/menu-planning-section";
import type { MenuPickerData } from "@/modules/menus/menu";
import type { ApprovalSnapshot } from "@/modules/menu-approvals/approval-snapshot";
import type { MenuSelectionStatus } from "@/generated/prisma/enums";
import type { StatusHistoryEntry } from "@/app/(app)/orders/_components/status-panel";

// Client-safe types shared by the review components (Menu Approvals + Orders merge, Phase 1). No behaviour lives here.

export interface NoteView {
  id: string;
  authorType: "CUSTOMER" | "KITCHEN" | "TEAM";
  authorName: string | null;
  body: string;
  versionNumber: number | null;
  createdAt: Date;
}

export interface VersionView {
  versionNumber: number;
  createdAt: Date;
  sentAt: Date | null;
  superseded: boolean;
  /** The frozen content sent to the customer; null for a version sent before snapshots existed. */
  snapshot: ApprovalSnapshot | null;
}

export interface ReviewHeaderData {
  orderId: string;
  orderNumber: string | null;
  customer: string;
  eventType: string | null;
  eventDate: string;
  guests: number;
  kitchen: string | null;
}

export interface ReviewPricing {
  individualPricingEnabled: boolean;
  /** The guests the menu price applies to (adults). */
  menuGuests: number;
  /** Every guest, children included: what an Extra dish or a per-plate add-on is charged for. */
  totalGuests: number;
  childrenCharge: number;
  discount: number;
  transportationCost: number;
  otherCharges: number;
  /** Sum of the team-added label + amount lines. */
  customCharges: number;
}

/**
 * What the viewer may do, worked out on the server from their permissions and handed down. It only hides controls: every action
 * checks again on the server. `canAct`: the stage buttons, planner edits, notes and the hand-made status (`menus: approve`).
 * `canQuotePrice`: the custom-menu quote, which also needs `orders: edit` (Decision 8).
 */
export interface ReviewCapabilities {
  canAct: boolean;
  canQuotePrice: boolean;
}

/** Everything the review shows about one menu approval, as plain data (what `loadMenuApprovalReviewData` returns, plus `capabilities`). */
export interface MenuApprovalReviewProps {
  menuSelectionId: string;
  status: MenuSelectionStatus;
  statusLabel: string;
  /** The order is completed: closed, so the menu status can't be changed by hand either. */
  orderCompleted?: boolean;
  currentVersion: number;
  lockedAt: Date | null;
  isCustomMenu: boolean;
  customPricePerPlate: number | null;
  header: ReviewHeaderData;
  capabilities: ReviewCapabilities;
  pricing: ReviewPricing;
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

export type ActionResult = { ok: true } | { ok: false; error: string };
export type SendMenuResult = { ok: true; url: string; versionNumber: number } | { ok: false; error: string };

/** One meal of the planner as it is saved (dates as ISO days, items by catalog id). */
export interface MealPlanPayload {
  date: string;
  mealType: MealSelection["mealType"];
  price: number | null;
  menuId: string | null;
  items: { itemType: "MENU_ITEM" | "ADD_ON"; catalogId: string; quantity: number; isExtra?: boolean }[];
}

/**
 * The server actions the review calls, handed in by whoever places the review (today the order's Menu Approval tab). The components never import an action themselves, so they carry no permission logic: each action
 * keeps its own `requirePermission` and location check on the server.
 */
export interface ReviewActions {
  saveMealPlan(menuSelectionId: string, entries: MealPlanPayload[]): Promise<ActionResult>;
  send(menuSelectionId: string): Promise<SendMenuResult>;
  recall(menuSelectionId: string): Promise<ActionResult>;
  approveAndSendToKitchen(menuSelectionId: string): Promise<ActionResult>;
  setCustomPrice(menuSelectionId: string, pricePerPlate: number): Promise<ActionResult>;
  addNote(menuSelectionId: string, body: string): Promise<ActionResult>;
  changeStatus(menuSelectionId: string, status: MenuSelectionStatus, reason: string): Promise<ActionResult>;
  loadPickerData(menuId: string): Promise<MenuPickerData | null>;
}

/** What the review is waiting on, so every button can disable itself while one action runs. */
export type ApprovalPending = "save" | "approve" | "send" | "recall" | "price" | "note" | null;

export type FoodDialogTarget = { date: string; mealType: MealTypeValue } | null;
