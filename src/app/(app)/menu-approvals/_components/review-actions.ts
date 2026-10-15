import type { ReviewActions } from "@/modules/menu-approvals/_components/review/types";
import {
  addMenuApprovalNoteAction,
  getMenuForApprovalPickerAction,
  approveAndSendToKitchenAction,
  changeMenuStatusAction,
  recallMenuAction,
  sendMenuForApprovalAction,
  setCustomMenuPriceAction,
  updateMenuApprovalMealPlanAction,
} from "../actions";

/**
 * The review's server actions, handed to the shared review components to the order's Menu Approval tab (the one place that shows the review; `/menu-approvals/[id]` redirects to it). The permission, location and stage checks stay inside each action, on the server.
 */
export const reviewActions: ReviewActions = {
  saveMealPlan: updateMenuApprovalMealPlanAction,
  send: (menuSelectionId) => sendMenuForApprovalAction({ menuSelectionId }),
  recall: recallMenuAction,
  approveAndSendToKitchen: approveAndSendToKitchenAction,
  setCustomPrice: setCustomMenuPriceAction,
  addNote: addMenuApprovalNoteAction,
  changeStatus: changeMenuStatusAction,
  loadPickerData: getMenuForApprovalPickerAction,
};
