import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, Crown, Link2, MessageSquare, ShieldCheck, User, FileText } from "lucide-react";
import { requireSuperAdminOrRedirect } from "../../../_lib/guard";
import { getTenant } from "@/modules/tenants/tenant";
import { listPlans } from "@/modules/subscriptions/plan";
import { Badge } from "@/components/ui/badge";
import { InfoBox, SettingsPanel, SettingsSection, Detail, DetailGrid } from "@/app/(app)/settings/_components/settings-ui";
import { formatPhoneDisplay } from "@/lib/phone";
import { PageHeader } from "../../_components/page-header";
import { Avatar, TenantStatusBadge, trialBadge } from "../../_components/display";
import { StatusActions } from "./_components/status-actions";
import { EditTenantDialog } from "./_components/edit-tenant-dialog";
import { SlugOverrideForm } from "./_components/slug-override-form";
import { AssignPlan } from "./_components/assign-plan";
import { ProviderConnect } from "./_components/provider-connect";
import { getChannelSettings } from "@/modules/notifications/channel-settings";
import { cn } from "cn";

const TABS = [
  { key: "overview", label: "Overview", icon: FileText },
  { key: "subscription", label: "Subscription", icon: Crown },
  { key: "account", label: "Account", icon: ShieldCheck },
] as const;

const longDate = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

const LIMITS: { key: "maxUsers" | "maxOrders" | "maxEvents" | "maxCustomers" | "maxMenuLinks" | "maxKitchens" | "maxStores"; label: string }[] = [
  { key: "maxUsers", label: "Team members" },
  { key: "maxOrders", label: "Orders" },
  { key: "maxEvents", label: "Events" },
  { key: "maxCustomers", label: "Customers" },
  { key: "maxMenuLinks", label: "Menu links" },
  { key: "maxKitchens", label: "Kitchens" },
  { key: "maxStores", label: "Stores" },
];

// Chunk 3 Group 3.2 + the 2026-10-03 redesign (design system §13): header with status and actions, then three tabs.
export default async function TenantDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  await requireSuperAdminOrRedirect();
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const [tenant, plans, whatsapp, email] = await Promise.all([getTenant(id), listPlans(), getChannelSettings(id, "whatsapp"), getChannelSettings(id, "email")]);
  if (!tenant) notFound();
  const active = TABS.find((t) => t.key === tab)?.key ?? "overview";
  const subscription = tenant.subscriptions[0];
  const plan = subscription?.subscriptionPlan;
  const trial = subscription?.status === "TRIALING" ? trialBadge(subscription.trialEndsAt ?? null) : null;
  const ownerName = [tenant.ownerFirstName, tenant.ownerLastName].filter(Boolean).join(" ");
  const address = [tenant.addressLine1, tenant.addressLine2, tenant.city, tenant.state, tenant.postalCode, tenant.country].filter(Boolean).join(", ");
  const base = `/super/tenants/${tenant.id}`;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Catering" }, { label: "Caterers", href: "/super/tenants" }, { label: tenant.name }]}
        title={
          <>
            <Avatar name={tenant.name} size="md" />
            {tenant.name}
            <TenantStatusBadge status={tenant.status} />
          </>
        }
        description={`${tenant.slug} · joined ${longDate(tenant.createdAt)}`}
        action={
          <div className="flex flex-wrap gap-2">
            <EditTenantDialog
              tenantId={tenant.id}
              initialValues={{
                name: tenant.name,
                ownerFirstName: tenant.ownerFirstName ?? "",
                ownerLastName: tenant.ownerLastName ?? "",
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
        }
      />

      <nav className="flex gap-1 overflow-x-auto border-b border-border" aria-label="Caterer sections">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "overview" ? base : `${base}?tab=${t.key}`}
            aria-current={active === t.key ? "page" : undefined}
            className={cn("-mb-px flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap sm:px-4", active === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            <t.icon className="size-4" />
            {t.label}
          </Link>
        ))}
      </nav>

      {active === "overview" && (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]" data-testid="tab-overview">
          <SettingsPanel>
            <SettingsSection icon={Building2} title="Business">
              <DetailGrid>
                <Detail label="Business name" value={tenant.name} />
                <Detail label="GST number" value={tenant.gstNumber} />
                <Detail label="Address" value={address} />
                <Detail label="Storefront link" value={<span className="font-mono text-[13px]">{tenant.slug}</span>} />
              </DetailGrid>
            </SettingsSection>
            <SettingsSection icon={User} title="Owner">
              <DetailGrid>
                <Detail label="Name" value={ownerName} />
                <Detail label="Email" value={tenant.contactEmail} />
                <Detail label="Phone" value={tenant.contactPhone ? formatPhoneDisplay(tenant.contactPhone) : null} />
                <Detail label="Created" value={longDate(tenant.createdAt)} />
              </DetailGrid>
            </SettingsSection>
          </SettingsPanel>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <h2 className="flex items-center gap-2.5 text-[15px] font-semibold">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Crown className="size-4" />
                </span>
                Plan
              </h2>
              <div className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                {plan?.name ?? "No plan"}
                {trial && <Badge variant={trial.variant}>{trial.label}</Badge>}
              </div>
              <Link href={`${base}?tab=subscription`} className="text-sm font-medium text-primary hover:underline">
                Change plan
              </Link>
            </div>
            {tenant.status !== "ACTIVE" && (
              <InfoBox tone={tenant.status === "SUSPENDED" ? "warning" : "neutral"} title={tenant.status === "SUSPENDED" ? "Suspended" : "Deactivated"}>
                <p>The caterer&apos;s team cannot sign in, and their customer links stop working, until they are activated again.</p>
              </InfoBox>
            )}
          </div>
        </div>
      )}

      {active === "subscription" && (
        <SettingsPanel className="max-w-2xl" >
          <SettingsSection icon={Crown} title="Current plan" description="Plan limits are definitions today: billing goes live in Chunk 20.">
            <div className="flex flex-wrap items-center gap-2 text-lg font-semibold" data-testid="tab-subscription">
              {plan?.name ?? "No plan assigned yet."}
              {subscription && <Badge variant={subscription.status === "TRIALING" ? "orange" : "success"}>{subscription.status === "TRIALING" ? "Trial" : "Active"}</Badge>}
              {trial && <Badge variant={trial.variant}>{trial.label}</Badge>}
            </div>
            {subscription?.trialEndsAt && <p className="text-sm text-muted-foreground">Trial ends {longDate(subscription.trialEndsAt)}.</p>}
            {plan && (
              <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                {LIMITS.map((limit) => (
                  <div key={limit.key} className="flex items-center justify-between gap-3 border-t border-border py-2 text-sm">
                    <dt className="text-muted-foreground">{limit.label}</dt>
                    <dd className="font-semibold">{plan[limit.key] === null ? "Unlimited" : plan[limit.key]?.toLocaleString("en-IN")}</dd>
                  </div>
                ))}
              </dl>
            )}
          </SettingsSection>
          <SettingsSection title="Assign a plan">
            <AssignPlan tenantId={tenant.id} plans={plans} currentPlanId={subscription?.subscriptionPlanId} />
          </SettingsSection>
        </SettingsPanel>
      )}

      {active === "account" && (
        <div className="flex max-w-2xl flex-col gap-4" data-testid="tab-account">
          <SettingsPanel>
            <SettingsSection icon={Link2} title="Storefront link" description="After a caterer has used both free changes, only you can change it.">
              <SlugOverrideForm tenantId={tenant.id} currentSlug={tenant.slug} slugChangeCount={tenant.slugChangeCount} />
            </SettingsSection>
            <SettingsSection icon={MessageSquare} title="Message providers" description="Connect WhatsApp and Email for this caterer. Once connected, they can switch each on in their own Settings. Email is delivered through Platterly's ZeptoMail once connected and switched on; WhatsApp messages are queued until its provider is added.">
              <ProviderConnect organizationId={tenant.id} connected={{ whatsapp: whatsapp.providerConnected, email: email.providerConnected }} />
            </SettingsSection>
            <SettingsSection icon={ShieldCheck} title="Account status" description="Suspend or deactivate blocks sign-in and stops the caterer's customer links. Every change is recorded in the audit log.">
              <div className="flex flex-wrap gap-2">
                <StatusActions tenantId={tenant.id} status={tenant.status} />
              </div>
            </SettingsSection>
          </SettingsPanel>
        </div>
      )}
    </>
  );
}
