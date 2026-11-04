import { BUSINESSES, INITIAL_CATERLY, MOCK_USER, type Profile, type ProductLink } from "./mock-data";

/** All the local-only state of the Account prototype. Pure data and a pure reducer, so it can be tested without a browser. */
export type AccountState = {
  selectedBusinessId: string;
  caterly: Record<string, ProductLink>;
  rivoNotify: boolean;
  productUpdates: boolean;
  profile: Profile;
};

export type Action =
  | { type: "selectBusiness"; id: string }
  | { type: "setUpCaterly"; businessId: string }
  | { type: "toggleRivoNotify" }
  | { type: "setProductUpdates"; value: boolean }
  | { type: "saveProfile"; profile: Profile };

export const INITIAL_STATE: AccountState = {
  selectedBusinessId: BUSINESSES[0].id,
  caterly: INITIAL_CATERLY,
  rivoNotify: false,
  productUpdates: true,
  profile: MOCK_USER.profile,
};

export function reduce(state: AccountState, action: Action): AccountState {
  switch (action.type) {
    case "selectBusiness":
      return BUSINESSES.some((b) => b.id === action.id) ? { ...state, selectedBusinessId: action.id } : state;
    case "setUpCaterly": {
      // Only a business that has no Caterly link yet can be set up; an active or trial link is never downgraded.
      if (!BUSINESSES.some((b) => b.id === action.businessId) || state.caterly[action.businessId]?.status !== "none") return state;
      return { ...state, caterly: { ...state.caterly, [action.businessId]: { status: "trial", detail: "Free trial, 14 days left" } } };
    }
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
    const ids = BUSINESSES.map((b) => b.id);
    const caterlyOk = !!v.caterly && ids.every((id) => ["active", "trial", "none"].includes(v.caterly?.[id]?.status ?? "") && typeof v.caterly?.[id]?.detail === "string");
    const p = v.profile;
    const profileOk = !!p && [p.fullName, p.email, p.phone, p.timezone, p.language].every((x) => typeof x === "string");
    if (!v.selectedBusinessId || !ids.includes(v.selectedBusinessId) || !caterlyOk || !profileOk || typeof v.rivoNotify !== "boolean" || typeof v.productUpdates !== "boolean") return INITIAL_STATE;
    return v as AccountState;
  } catch {
    return INITIAL_STATE;
  }
}

export function selectedBusiness(state: AccountState) {
  return BUSINESSES.find((b) => b.id === state.selectedBusinessId) ?? BUSINESSES[0];
}
