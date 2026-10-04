/**
 * Plan invoice numbers (AJ, 2026-10-04): `<prefix><caterer initials>-<yy>-<mm>-<n>`, e.g. FPAC-26-10-1 for the
 * first invoice of "ABC Caterer". The month is the Indian calendar month. `n` is one running number across all
 * caterers, so two caterers whose names share initials can never get the same invoice number.
 */
export function invoiceInitials(name: string): string {
  const letters = name
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase())
    .join("");
  return letters.slice(0, 4) || "X";
}

export function formatInvoiceNumber(prefix: string, caterer: string, paidAt: Date, n: number): string {
  const ist = new Date(paidAt.getTime() + 5.5 * 60 * 60 * 1000);
  const yy = String(ist.getUTCFullYear() % 100).padStart(2, "0");
  const mm = String(ist.getUTCMonth() + 1).padStart(2, "0");
  return `${prefix}${invoiceInitials(caterer)}-${yy}-${mm}-${n}`;
}
