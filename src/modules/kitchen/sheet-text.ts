// The two free-text blocks on the kitchen order PDF, written by each kitchen in Settings -> Kitchen Rules (AJ, 2026-10-17). Pure, so the
// settings form and the tests can use it too.

export const KITCHEN_SHEET_TEXT_KEY = "kitchen.order-sheet";
export const KITCHEN_SHEET_TEXT_MAX = 3000;

export interface KitchenSheetText {
  /** One point per line. Printed under "Service Also Include". */
  serviceIncludes: string;
  /** One point per line. Printed under "Please Note". */
  pleaseNote: string;
}

/** Until a kitchen writes its own, the wording of the sheet it used on paper. */
export const DEFAULT_KITCHEN_SHEET_TEXT: KitchenSheetText = {
  serviceIncludes: [
    "Starters will be moved around for 1 hr",
    "Bisleri water cans with cups",
    "Staff for service",
    "Live cooking of starters and live counter",
    "Melamine plates",
    "Stainless steel chafing dishes",
    "Tables with frill cloth for buffet",
    "Cutlery & crockery",
  ].join("\n"),
  pleaseNote: [
    "Food consumption is decided by the number of plates used.",
    "Guaranteed guest is considered as the chargeable number. If numbers increase on the day of the event, it is charged on actuals.",
    "Buffet service is available only till 03:30 PM max. Beyond this, an additional charge will be added to transport.",
    "We do not provide tables and chairs for seating.",
  ].join("\n"),
};

/** A typed block as separate points: one per non-empty line, without a number or bullet the kitchen typed (the sheet numbers them). */
export function textToPoints(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:\d+\s*[.)]|[-•*])\s*/, "").trim())
    .filter((line) => line.length > 0);
}
