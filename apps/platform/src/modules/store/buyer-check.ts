// The billing details checks moved to the shared contract (packages/contract/src/billing-profile.ts) so the Store form, the Account form and Ops run the same rules.
export { checkBuyer, type BuyerField } from "@platterly/contract";
