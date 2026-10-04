import { VISIT_SOURCE_LABEL, type VisitDeviceValue, type VisitSourceValue } from "@/modules/storefront-visits/visit-math";
import { monthKey, monthLabel } from "./report-math";

/**
 * Chunk 22.3 — the Storefront report's arithmetic: where visitors come from, what they do next (the funnel by
 * source) and which channel the orders came through. Pure functions over plain rows.
 */
export interface VisitRow {
  id: string;
  visitedAt: Date;
  source: VisitSourceValue;
  sourceDetail: string | null;
  device: VisitDeviceValue;
  browser: string | null;
  country: string | null;
  city: string | null;
  visitorKey: string;
}
export interface DraftRow {
  visitId: string | null;
  status: "IN_PROGRESS" | "COMPLETED";
  currentStep: number;
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);
const tally = <T,>(items: T[], keyOf: (item: T) => string | null) => {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = keyOf(item);
    if (key) map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
};

export interface FunnelRow {
  /** A source label, or "Before tracking" for journeys that started with no recorded visit. */
  label: string;
  visits: number;
  started: number;
  reachedReview: number;
  submitted: number;
  /** Submitted as a share of visits. */
  conversionPercent: number | null;
}
export interface SourceRow {
  source: VisitSourceValue;
  label: string;
  visits: number;
  visitors: number;
  sharePercent: number;
}
export interface StorefrontReport {
  visits: number;
  visitors: number;
  started: number;
  submitted: number;
  conversionPercent: number | null;
  bySource: SourceRow[];
  series: { label: string; visits: number }[];
  seriesUnit: "day" | "month";
  devices: { label: string; count: number }[];
  browsers: { label: string; count: number }[];
  countries: { label: string; count: number }[];
  cities: { label: string; count: number }[];
  embedSites: { label: string; count: number }[];
  referralSites: { label: string; count: number }[];
  campaignTags: { label: string; count: number }[];
  funnel: FunnelRow[];
}

const DEVICE_LABEL: Record<VisitDeviceValue, string> = { MOBILE: "Phone", TABLET: "Tablet", DESKTOP: "Computer" };

export function computeStorefront(visits: VisitRow[], drafts: DraftRow[], rangeDays: number | null): StorefrontReport {
  const visitors = new Set(visits.map((v) => v.visitorKey));
  const sourceOf = new Map(visits.map((v) => [v.id, v.source]));

  const sourceRows = new Map<VisitSourceValue, { visits: number; keys: Set<string> }>();
  for (const v of visits) {
    const row = sourceRows.get(v.source) ?? { visits: 0, keys: new Set<string>() };
    row.visits += 1;
    row.keys.add(v.visitorKey);
    sourceRows.set(v.source, row);
  }

  const daily = rangeDays !== null && rangeDays <= 62;
  const seriesMap = new Map<string, number>();
  for (const v of visits) {
    const ist = new Date(v.visitedAt.getTime() + 5.5 * 60 * 60 * 1000);
    const key = daily ? ist.toISOString().slice(0, 10) : monthKey(v.visitedAt, "ist");
    seriesMap.set(key, (seriesMap.get(key) ?? 0) + 1);
  }

  // Funnel: a journey is credited to the source of the visit it started from (only visits inside the range count).
  const funnelMap = new Map<string, FunnelRow>();
  const rowFor = (label: string) => {
    const row = funnelMap.get(label) ?? { label, visits: 0, started: 0, reachedReview: 0, submitted: 0, conversionPercent: null };
    funnelMap.set(label, row);
    return row;
  };
  for (const v of visits) rowFor(VISIT_SOURCE_LABEL[v.source]).visits += 1;
  let started = 0;
  let submitted = 0;
  for (const d of drafts) {
    const source = d.visitId ? sourceOf.get(d.visitId) : undefined;
    if (d.visitId && !source) continue; // came from a visit outside the range
    const row = rowFor(source ? VISIT_SOURCE_LABEL[source] : "Before tracking");
    row.started += 1;
    started += 1;
    if (d.status === "COMPLETED" || d.currentStep >= 3) row.reachedReview += 1;
    if (d.status === "COMPLETED") {
      row.submitted += 1;
      submitted += 1;
    }
  }
  const funnel = [...funnelMap.values()].map((r) => ({ ...r, conversionPercent: pct(r.submitted, r.visits) })).sort((a, b) => b.visits - a.visits || b.started - a.started);

  const label = (source: VisitSourceValue) => (v: VisitRow) => (v.source === source ? v.sourceDetail : null);
  return {
    visits: visits.length,
    visitors: visitors.size,
    started,
    submitted,
    conversionPercent: pct(submitted, visits.length),
    bySource: [...sourceRows.entries()]
      .map(([source, r]) => ({ source, label: VISIT_SOURCE_LABEL[source], visits: r.visits, visitors: r.keys.size, sharePercent: Math.round((r.visits / visits.length) * 100) }))
      .sort((a, b) => b.visits - a.visits),
    series: [...seriesMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, count]) => ({ label: daily ? key.slice(5) : monthLabel(key), visits: count })),
    seriesUnit: daily ? "day" : "month",
    devices: tally(visits, (v) => DEVICE_LABEL[v.device]),
    browsers: tally(visits, (v) => v.browser),
    countries: tally(visits, (v) => v.country),
    cities: tally(visits, (v) => v.city),
    embedSites: tally(visits, (v) => (v.source === "EMBED" ? (v.sourceDetail ?? "Unknown website") : null)),
    referralSites: tally(visits, label("REFERRAL")),
    campaignTags: tally(visits, label("CAMPAIGN")),
    funnel,
  };
}

export type OrderChannel = "STOREFRONT" | "QUOTATION" | "TEAM";
export const CHANNEL_LABEL: Record<OrderChannel, string> = { STOREFRONT: "Public storefront", QUOTATION: "Accepted quotation", TEAM: "Created by your team" };

export interface ChannelOrder {
  fromStorefront: boolean;
  fromQuotation: boolean;
  total: number;
  status: string;
}
export interface ChannelRow {
  channel: OrderChannel;
  label: string;
  orders: number;
  revenue: number;
  avgOrder: number;
  sharePercent: number;
}

/** Which door each order came in through. Cancelled orders are left out, as in every other report. */
export function computeChannels(orders: ChannelOrder[]): ChannelRow[] {
  const live = orders.filter((o) => o.status !== "CANCELLED");
  const rows = new Map<OrderChannel, { orders: number; revenue: number }>();
  for (const o of live) {
    const channel: OrderChannel = o.fromStorefront ? "STOREFRONT" : o.fromQuotation ? "QUOTATION" : "TEAM";
    const row = rows.get(channel) ?? { orders: 0, revenue: 0 };
    row.orders += 1;
    row.revenue += o.total;
    rows.set(channel, row);
  }
  return (["STOREFRONT", "QUOTATION", "TEAM"] as OrderChannel[]).map((channel) => {
    const r = rows.get(channel) ?? { orders: 0, revenue: 0 };
    return { channel, label: CHANNEL_LABEL[channel], orders: r.orders, revenue: Math.round(r.revenue * 100) / 100, avgOrder: r.orders ? Math.round((r.revenue / r.orders) * 100) / 100 : 0, sharePercent: live.length ? Math.round((r.orders / live.length) * 100) : 0 };
  });
}
