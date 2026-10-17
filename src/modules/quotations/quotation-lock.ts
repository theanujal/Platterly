import type { QuotationStatus } from "@/generated/prisma/enums";

/**
 * Once a quotation is sent its information is locked, like an order's while its menu is with the customer (AJ, 2026-10-18): what the
 * customer sees and answers is what is on file. Only a quotation still being written (Draft) or sent back by the customer (Changes
 * Requested) can be edited. A quotation with the customer can be recalled to edit; an accepted, rejected or expired one is final.
 * Pure and client-safe.
 */
const EDITABLE: QuotationStatus[] = ["DRAFT", "CHANGES_REQUESTED"];
const RECALLABLE: QuotationStatus[] = ["SENT", "VIEWED"];

export const isQuotationEditable = (status: QuotationStatus) => EDITABLE.includes(status);
export const isQuotationRecallable = (status: QuotationStatus) => RECALLABLE.includes(status);

export const QUOTATION_LOCKED_MESSAGE = "This quotation has been sent, so it can't be edited. Recall it to edit it, then send it again.";
