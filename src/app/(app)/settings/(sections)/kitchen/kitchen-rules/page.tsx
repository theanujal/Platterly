import type { Metadata } from "next";
import { hasPermission, requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { getKitchenRules } from "@/modules/kitchen/kitchen-rules";
import { EditablePanel } from "../../../_components/editable-panel";
import { Detail, DetailGrid, SettingsCard } from "../../../_components/settings-ui";
import { getLocationSettings, listLocations } from "@/modules/locations/locations";
import { LocationsCard } from "./_components/locations-card";
import { KitchenRulesForm } from "./_components/kitchen-rules-form";

export const metadata: Metadata = {
  title: "Kitchen Rules — Platterly",
  robots: { index: false, follow: false },
};

export default async function KitchenRulesPage() {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ settings: ["view"] }, organizationId);
  const rules = await getKitchenRules(organizationId);
  const [locationSettings, locations, canEdit] = await Promise.all([
    getLocationSettings(organizationId),
    listLocations(organizationId),
    hasPermission({ settings: ["edit"] }, organizationId),
  ]);

  return (
    <SettingsCard title="Kitchen Rules" description="How orders reach your kitchen and how much it cooks.">
      <EditablePanel
        editLabel="Edit Rules"
        heading={<h2 className="text-sm font-semibold">Current Rules</h2>}
        view={
          <DetailGrid>
            <Detail label="Extra Quantity to Cook" value={`${rules.extraPercent}% more than the guest count`} />
            <Detail
              label="Sent to the Kitchen"
              value={rules.daysBeforeEvent === 0 ? "On the day of the event" : `${rules.daysBeforeEvent} ${rules.daysBeforeEvent === 1 ? "day" : "days"} before the event`}
            />
          </DetailGrid>
        }
        edit={<KitchenRulesForm initialValues={rules} />}
      />
      <LocationsCard
        planAllows={locationSettings.planAllows}
        enabled={locationSettings.enabled}
        canEdit={canEdit}
        locations={locations.map((l) => ({ id: l.id, name: l.name, isDefault: l.isDefault }))}
      />
    </SettingsCard>
  );
}
