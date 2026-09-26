import type { MealType } from "@/generated/prisma/enums";

// Client-safe (types only). The frozen content of one sent menu version —
// what the customer's approval page renders and what "Approve Menu" approves.
// Stored as JSON on MenuVersion.snapshot so a later edit to the Order can never
// change what an already-sent link shows.
export interface ApprovalSnapshot {
  customerName: string;
  eventTypeName: string | null;
  /** ISO dates (YYYY-MM-DD). */
  eventStartDate: string;
  eventEndDate: string;
  venue: string | null;
  guests: number | null;
  total: number;
  meals: {
    date: string;
    mealType: MealType;
    menuName: string | null;
    items: { name: string; quantity: number }[];
  }[];
  /** Dishes/add-ons picked outside a meal slot (storefront orders keep them on the menu selection). */
  selectedItems: { name: string; isExtra: boolean }[];
  isCustomMenu: boolean;
}

export const MEAL_TYPE_LABEL: Record<MealType, string> = {
  BREAKFAST: "Breakfast",
  LUNCH: "Lunch",
  HITEA: "Hi-Tea",
  DINNER: "Dinner",
  OTHER: "Other",
};
