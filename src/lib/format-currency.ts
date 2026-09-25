// Client-safe INR formatter for the customer-facing storefront. (The admin
// pages each keep their own copy; a later sweep can point them here.)
export function formatInr(amount: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(amount);
}
