import { BUSINESS, INITIAL_CATERLY, MOCK_USER, PRODUCTS, type ProductId, type Profile, type ProductLink } from "./mock-data";

/** All the local-only state of the Account prototype. Pure data and a pure reducer, so it can be tested without a browser. */
export type AccountState = {
  selectedProduct: ProductId;
  caterly: ProductLink;
  rivoNotify: boolean;
  productUpdates: boolean;
  profile: Profile;
};

export type Action =
  | { type: "selectProduct"; id: ProductId }
  | { type: "setUpCaterly" }
  | { type: "toggleRivoNotify" }
  | { type: "setProductUpdates"; value: boolean }
  | { type: "saveProfile"; profile: Profile };

export const INITIAL_STATE: AccountState = {
  selectedProduct: "caterly",
  caterly: INITIAL_CATERLY,
  rivoNotify: false,
  productUpdates: true,
  profile: MOCK_USER.profile,
};

export function reduce(state: AccountState, action: Action): AccountState {
  switch (action.type) {
    case "selectProduct":
      return PRODUCTS.some((p) => p.id === action.id) ? { ...state, selectedProduct: action.id } : state;
    case "setUpCaterly":
      // Only a business that has no Caterly link yet can be set up; an active or trial link is never downgraded.
      if (state.caterly.status !== "none") return state;
      return { ...state, caterly: { status: "trial", detail: "Free trial, 14 days left" } };
    case "toggleRivoNotify":
      return { ...state, rivoNotify: !state.rivoNotify };
    case "setProductUpdates":
      return { ...state, productUpdates: action.value };
    case "saveProfile":
      return { ...state, profile: action.profile };
  }
}

/** Reads a saved state back. Anything that is not exactly the expected shape falls back to the initial state. */
export function parseStored(raw: string | null): AccountState {
  if (!raw) return INITIAL_STATE;
  try {
    const v = JSON.parse(raw) as Partial<AccountState>;
    const productOk = PRODUCTS.some((p) => p.id === v.selectedProduct);
    const caterlyOk = !!v.caterly && ["active", "trial", "none"].includes(v.caterly.status) && typeof v.caterly.detail === "string";
    const p = v.profile;
    const profileOk = !!p && [p.fullName, p.email, p.phone, p.timezone, p.language].every((x) => typeof x === "string");
    if (!productOk || !caterlyOk || !profileOk || typeof v.rivoNotify !== "boolean" || typeof v.productUpdates !== "boolean") return INITIAL_STATE;
    return v as AccountState;
  } catch {
    return INITIAL_STATE;
  }
}

export function selectedProduct(state: AccountState) {
  return PRODUCTS.find((p) => p.id === state.selectedProduct) ?? PRODUCTS[0];
}

export { BUSINESS };
