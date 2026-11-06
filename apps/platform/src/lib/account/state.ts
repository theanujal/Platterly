import type { ProductKey } from "@/modules/account/types";
import { PRODUCTS } from "./catalogue";

/** The only local state the Account keeps: which product the switcher points at. Everything else comes from the server. */
export type ProductId = ProductKey;
export type AccountState = { selectedProduct: ProductId };
export type Action = { type: "selectProduct"; id: ProductId };

export const INITIAL_STATE: AccountState = { selectedProduct: "caterly" };

export function reduce(state: AccountState, action: Action): AccountState {
  switch (action.type) {
    case "selectProduct":
      return PRODUCTS.some((p) => p.id === action.id) ? { ...state, selectedProduct: action.id } : state;
  }
}

/** Reads a saved choice back. Anything that is not exactly a known product falls back to the initial state. */
export function parseStored(raw: string | null): AccountState {
  if (!raw) return INITIAL_STATE;
  try {
    const v = JSON.parse(raw) as Partial<AccountState>;
    return PRODUCTS.some((p) => p.id === v.selectedProduct) ? { selectedProduct: v.selectedProduct as ProductId } : INITIAL_STATE;
  } catch {
    return INITIAL_STATE;
  }
}

export function selectedProduct(state: AccountState) {
  return PRODUCTS.find((p) => p.id === state.selectedProduct) ?? PRODUCTS[0];
}
