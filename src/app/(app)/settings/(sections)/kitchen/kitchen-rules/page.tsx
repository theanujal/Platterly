import type { Metadata } from "next";
import { hasPermission, requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { getKitchenRules, getKitchenSheetText } from "@/modules/kitchen/kitchen-rules";
import { EditablePanel } from "../../../_components/editable-panel";
import { Detail, DetailGrid, SettingsCard } from "../../../_components/settings-ui";
import { getLocationSettings, listLocations } from "@/modules/locations/locations";
import { LocationsCard } from "./_components/locations-card";
import { KitchenRulesForm } from "./_components/kitchen-rules-form";
import { KitchenSheetTextForm } from "./_components/kitchen-sheet-text-form";
import { textToPoints } from "@/modules/kitchen/sheet-text";

export const metadata: Metadata = {
  title: "Kitchen Rules — Caterly",
  robots: { index: false, follow: false },
};

export default async function KitchenRulesPage() {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ settings: ["view"] }, organizationId);
  const [rules, sheetText] = await Promise.all([getKitchenRules(organizationId), getKitchenSheetText(organizationId)]);
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
      <EditablePanel
        editLabel="Edit Texts"
        heading={
          <div>
            <h2 className="text-sm font-semibold">Kitchen Order Sheet</h2>
            <p className="text-xs text-muted-foreground">The two text blocks printed on every kitchen order PDF.</p>
          </div>
        }
        view={
          <DetailGrid>
            <Detail label="Service Also Include" value={<SheetPoints text={sheetText.serviceIncludes} />} />
            <Detail label="Please Note" value={<SheetPoints text={sheetText.pleaseNote} />} />
          </DetailGrid>
        }
        edit={<KitchenSheetTextForm initialValues={sheetText} />}
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

/** The saved points as a numbered list, as the sheet prints them; "Not set" when empty. */
function SheetPoints({ text }: { text: string }) {
  const points = textToPoints(text);
  if (points.length === 0) return <span className="text-muted-foreground">Not set (left off the sheet)</span>;
  return (
    <ol className="flex list-decimal flex-col gap-0.5 pl-5 font-normal">
      {points.map((point, index) => (
        <li key={index}>{point}</li>
      ))}
    </ol>
  );
}
