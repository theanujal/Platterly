import type { Metadata } from "next";
import { hasPermission, requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { originFor } from "@/lib/routing/hosts";
import { listApiKeys } from "@/modules/api/keys";
import { listDeliveries, listWebhookEndpoints } from "@/modules/webhooks/endpoints";
import { SettingsCard } from "../../../_components/settings-ui";
import { ApiKeysPanel } from "./_components/api-keys-panel";
import { WebhooksPanel } from "./_components/webhooks-panel";

export const metadata: Metadata = {
  title: "API & Webhooks — Platterly",
  robots: { index: false, follow: false },
};

export default async function ApiWebhooksPage() {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ settings: ["view"] }, organizationId);
  const [keys, endpoints, deliveries, canEdit] = await Promise.all([listApiKeys(organizationId), listWebhookEndpoints(organizationId), listDeliveries(organizationId, { take: 20 }), hasPermission({ settings: ["edit"] }, organizationId)]);
  const baseUrl = `${originFor("catering")}/api/v1`;

  return (
    <SettingsCard title="API & Webhooks" description="Let your own software or tools read your menus, customers and orders, create orders, and hear about new activity as it happens.">
      <ApiKeysPanel
        baseUrl={baseUrl}
        canEdit={canEdit}
        keys={keys.map((k) => ({ id: k.id, name: k.name, prefix: k.prefix, scopes: k.scopes, createdAt: k.createdAt.toISOString(), lastUsedAt: k.lastUsedAt?.toISOString() ?? null, revokedAt: k.revokedAt?.toISOString() ?? null }))}
      />
      <WebhooksPanel
        canEdit={canEdit}
        endpoints={endpoints.map((e) => ({ id: e.id, url: e.url, description: e.description, events: e.events, isActive: e.isActive, disabledReason: e.disabledReason }))}
        deliveries={deliveries.map((d) => ({ id: d.id, eventName: d.eventName, status: d.status, attempts: d.attempts, lastStatusCode: d.lastStatusCode, lastError: d.lastError, createdAt: d.createdAt.toISOString(), endpointUrl: endpoints.find((e) => e.id === d.endpointId)?.url ?? "" }))}
      />
    </SettingsCard>
  );
}
