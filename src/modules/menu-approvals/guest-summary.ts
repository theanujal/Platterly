/**
 * Kids are counted on top of the adults, so a headcount is always shown as the parts and the total:
 * "50 adults + 10 kids (0–5) + 20 kids (5–10)" with the total beside it. A kids group of zero is left out.
 */
export function guestBreakdown(adults: number, below5: number, from5To10: number): { parts: string; total: number } {
  const parts = [`${adults} adult${adults === 1 ? "" : "s"}`];
  if (below5 > 0) parts.push(`${below5} kid${below5 === 1 ? "" : "s"} (0–5)`);
  if (from5To10 > 0) parts.push(`${from5To10} kid${from5To10 === 1 ? "" : "s"} (5–10)`);
  return { parts: parts.join(" + "), total: adults + below5 + from5To10 };
}
