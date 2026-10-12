import type { Metadata } from "next";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { EditablePanel } from "../../../_components/editable-panel";
import { Detail, DetailGrid, InfoBox, SettingsCard } from "../../../_components/settings-ui";
import { getTenantTimeZone } from "@/lib/settings/timezone";
import { TIME_ZONE_OPTIONS } from "@/lib/time/timezone";
import { getCurrencyPreferencesAction } from "./actions";
import { TimeZoneForm } from "./_components/time-zone-form";
import { CurrencyPreferencesForm } from "./_components/currency-preferences-form";
import { ROUNDING_OPTIONS } from "./types";

export const metadata: Metadata = {
  title: "Currency & Time Zone — Platterly",
  robots: { index: false, follow: false },
};

export default async function CurrencyPreferencesPage() {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ settings: ["view"] }, organizationId);
  const preferences = await getCurrencyPreferencesAction();
  const timeZone = await getTenantTimeZone(organizationId);

  return (
    <SettingsCard title="Currency & Time Zone" description="How amounts are displayed, and when a day starts for your business.">
      <EditablePanel
        editLabel="Edit Preferences"
        heading={<h2 className="text-sm font-semibold">Display Format</h2>}
        view={
          <>
            <DetailGrid>
              <Detail label="Currency Symbol" value={preferences.symbol} />
              <Detail label="Decimal Places" value={String(preferences.decimalPlaces)} />
              <Detail label="Rounding" value={ROUNDING_OPTIONS.find((o) => o.value === preferences.roundingMode)?.label} />
            </DetailGrid>
            <InfoBox tone="neutral">
              <p>Display and formatting only — this doesn&apos;t change any calculations. India GST remains the only tax engine.</p>
            </InfoBox>
          </>
        }
        edit={<CurrencyPreferencesForm initialValues={preferences} />}
      />
      <EditablePanel
        editLabel="Edit Time Zone"
        heading={<h2 className="text-sm font-semibold">Time Zone</h2>}
        view={
          <>
            <DetailGrid>
              <Detail label="Time Zone" value={TIME_ZONE_OPTIONS.find((o) => o.value === timeZone)?.label ?? timeZone} />
            </DetailGrid>
            <InfoBox tone="neutral">
              <p>Decides Today / Tomorrow on orders, overdue payments and the calendar. Every business starts on India time.</p>
            </InfoBox>
          </>
        }
        edit={<TimeZoneForm initialValue={timeZone} />}
      />
    </SettingsCard>
  );
}
