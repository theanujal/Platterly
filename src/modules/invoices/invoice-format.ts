// Client-safe formatting shared by the invoice pages, dialogs and lists, and by every other page that shows rupees.
export const inr = (n: unknown) => `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** Without thousands separators: "₹1234.50". */
export const inrPlain = (n: number) => `₹${n.toFixed(2)}`;
/** Up to two decimals, none when whole: "₹1,234.5". */
export const inrUpTo2 = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
/** For PDFs: the standard PDF font has no rupee glyph, so INR is written "Rs.". */
export const inrPdf = (n: unknown) => `Rs. ${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const percent = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("en-IN", { maximumFractionDigits: 1 })}%`);
export const longDate = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
