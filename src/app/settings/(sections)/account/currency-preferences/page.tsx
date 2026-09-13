import type { Metadata } from "next";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { getCurrencyPreferencesAction } from "./actions";
import { CurrencyPreferencesForm } from "./_components/currency-preferences-form";

export const metadata: Metadata = {
  title: "Currency Preferences — Platterly",
  robots: { index: false, follow: false },
};

export default async function CurrencyPreferencesPage() {
  const { organizationId } = await requireActiveOrganization();
  const preferences = await getCurrencyPreferencesAction(organizationId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Currency Preferences</h1>
        <p className="text-sm text-muted-foreground">How amounts are displayed across the app.</p>
      </div>
      <CurrencyPreferencesForm initialValues={preferences} />
    </div>
  );
}
