import type { Metadata } from "next";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { EditablePanel } from "../../../_components/editable-panel";
import { Detail, DetailGrid, InfoBox, SettingsCard } from "../../../_components/settings-ui";
import { getCurrencyPreferencesAction } from "./actions";
import { CurrencyPreferencesForm } from "./_components/currency-preferences-form";
import { ROUNDING_OPTIONS } from "./types";

export const metadata: Metadata = {
  title: "Currency Preferences — Platterly",
  robots: { index: false, follow: false },
};

export default async function CurrencyPreferencesPage() {
  const { organizationId } = await requireActiveOrganization();
  const preferences = await getCurrencyPreferencesAction(organizationId);

  return (
    <SettingsCard title="Currency Preferences" description="How amounts are displayed across the app.">
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
    </SettingsCard>
  );
}
