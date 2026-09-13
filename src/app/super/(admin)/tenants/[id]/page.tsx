import { notFound } from "next/navigation";
import { requireSuperAdminOrRedirect } from "../../../_lib/guard";
import { getTenant } from "@/modules/tenants/tenant";
import { listPlans } from "@/modules/subscriptions/plan";
import { Badge } from "@/components/ui/badge";
import { StatusActions } from "./_components/status-actions";
import { EditTenantDialog } from "./_components/edit-tenant-dialog";
import { SlugOverrideForm } from "./_components/slug-override-form";
import { AssignPlan } from "./_components/assign-plan";

const PROFILE_FIELDS: { key: "ownerName" | "contactPhone" | "contactEmail" | "gstNumber" | "city" | "state" | "country"; label: string }[] = [
  { key: "ownerName", label: "Owner" },
  { key: "contactPhone", label: "Phone" },
  { key: "contactEmail", label: "Email" },
  { key: "gstNumber", label: "GST number" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "country", label: "Country" },
];

// Chunk 3 Group 3.2 — Caterer profile: view/edit business fields, status
// transitions, and the Super Admin slug-override escalation path.
export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdminOrRedirect();
  const { id } = await params;
  const [tenant, plans] = await Promise.all([getTenant(id), listPlans()]);
  if (!tenant) {
    notFound();
  }
  const currentSubscription = tenant.subscriptions[0];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">{tenant.name}</h1>
          <p className="text-sm text-neutral-500">/{tenant.slug}</p>
        </div>
        <Badge variant={tenant.status === "ACTIVE" ? "default" : "secondary"}>{tenant.status}</Badge>
      </div>

      <div className="flex gap-2">
        <StatusActions tenantId={tenant.id} status={tenant.status} />
        <EditTenantDialog
          tenantId={tenant.id}
          initialValues={{
            name: tenant.name,
            ownerName: tenant.ownerName ?? "",
            contactPhone: tenant.contactPhone ?? "",
            contactEmail: tenant.contactEmail ?? "",
            gstNumber: tenant.gstNumber ?? "",
            addressLine1: tenant.addressLine1 ?? "",
            addressLine2: tenant.addressLine2 ?? "",
            city: tenant.city ?? "",
            state: tenant.state ?? "",
            postalCode: tenant.postalCode ?? "",
            country: tenant.country ?? "",
          }}
        />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {PROFILE_FIELDS.map((field) => (
          <div key={field.key}>
            <dt className="text-neutral-500">{field.label}</dt>
            <dd>{tenant[field.key] ?? "—"}</dd>
          </div>
        ))}
        <div>
          <dt className="text-neutral-500">Created</dt>
          <dd>{tenant.createdAt.toLocaleDateString()}</dd>
        </div>
      </dl>

      <div className="rounded-lg border border-neutral-200 p-4">
        <h2 className="mb-2 text-sm font-medium">Storefront slug override</h2>
        <SlugOverrideForm tenantId={tenant.id} currentSlug={tenant.slug} slugChangeCount={tenant.slugChangeCount} />
      </div>

      <div className="rounded-lg border border-neutral-200 p-4">
        <h2 className="mb-2 text-sm font-medium">Subscription</h2>
        <p className="mb-2 text-sm text-neutral-500">
          {currentSubscription
            ? `${currentSubscription.subscriptionPlan.name} — ${currentSubscription.status}${
                currentSubscription.trialEndsAt
                  ? ` (trial ends ${currentSubscription.trialEndsAt.toLocaleDateString()})`
                  : ""
              }`
            : "No plan assigned yet."}
        </p>
        <AssignPlan tenantId={tenant.id} plans={plans} currentPlanId={currentSubscription?.subscriptionPlanId} />
      </div>
    </div>
  );
}
