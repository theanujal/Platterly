import "server-only";
import { CONTRACT_VERSION, type EntitlementDef, type ProductManifest } from "@platterly/contract";
import { originFor } from "@/lib/routing/hosts";
import { CATERING_REPORTS } from "./reports";
import { TRIAL_DURATION_DAYS } from "@/modules/subscriptions/trial-plan";

/** The plan limits catering enforces today (`SubscriptionPlan` columns and `limits.ts`), declared once for ops's plan editor. */
export const CATERING_ENTITLEMENTS: EntitlementDef[] = [
  { key: "maxUsers", type: "limit", label: "Team members" },
  { key: "maxEvents", type: "limit", label: "Events" },
  { key: "maxOrders", type: "limit", label: "Orders" },
  { key: "maxKitchens", type: "limit", label: "Kitchens" },
  { key: "maxStores", type: "limit", label: "Stores" },
  { key: "maxCustomers", type: "limit", label: "Customers" },
  { key: "maxMenuLinks", type: "limit", label: "Menu links" },
  { key: "maxStorageMb", type: "limit", label: "Storage (MB)" },
  { key: "maxReports", type: "limit", label: "Reports" },
  { key: "maxWhatsappMessages", type: "limit", label: "WhatsApp messages" },
  { key: "multiLocation", type: "flag", label: "Multiple locations" },
];

/** Bumped by hand when the manifest changes; ops shows it next to the product. */
export const CATERING_MANIFEST_VERSION = "2026.10.05";

export function buildManifest(productKey: string): ProductManifest {
  return {
    contract: CONTRACT_VERSION,
    productKey,
    name: "Catering",
    version: CATERING_MANIFEST_VERSION,
    baseUrl: originFor("catering"),
    entitlements: CATERING_ENTITLEMENTS,
    // A new trial carries no limits (null = unlimited), exactly like the Trial plan today.
    trial: { days: TRIAL_DURATION_DAYS, entitlements: { ...Object.fromEntries(CATERING_ENTITLEMENTS.filter((e) => e.type === "limit").map((e) => [e.key, null])), multiLocation: false } },
    events: ["business.signed_up", "business.updated", "usage.reported", "message.requested"],
    messageTemplates: ["welcome_owner"],
    tabs: [{ key: "overview", label: "Overview" }],
    reports: CATERING_REPORTS,
    actions: ["suspend", "reactivate", "update", "slug", "provider", "delete", "restore"],
  };
}
