import { STORE_KEY_FOR_OPS_KEY } from "@platterly/contract";

/** The key Ops uses for a product, from the Store's key (`caterly` is `catering` in Ops). A key not listed is used as it is. Kept free of other imports so any module may use it. */
export const opsKeyFor = (storeKey: string) => Object.entries(STORE_KEY_FOR_OPS_KEY).find(([, store]) => store === storeKey)?.[0] ?? storeKey;
