import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { platformAccountOrigin } from "@/lib/platform/config";
import { InfoBox, SettingsCard, SettingsPanel } from "../../../_components/settings-ui";

export const metadata: Metadata = {
  title: "Change Password — Caterly",
  robots: { index: false, follow: false },
};

/**
 * Passwords live in the Platterly Account (AJ, 2026-11-10): one password for every Platterly product, changed in one place. Caterly has no password of its own
 * and no form here; the Account asks for the current password and signs the person out of their other devices.
 */
export default function ChangePasswordPage() {
  return (
    <SettingsCard title="Change Password" description="Your password is managed in your Platterly Account.">
      <SettingsPanel>
        <InfoBox title="One password for every Platterly product">
          Change your password in your Platterly Account, and it changes everywhere you sign in with Platterly.{" "}
          <a href={`${platformAccountOrigin()}/security`} className="inline-flex items-center gap-1 font-medium underline">
            Open Security in your Account <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        </InfoBox>
      </SettingsPanel>
    </SettingsCard>
  );
}
