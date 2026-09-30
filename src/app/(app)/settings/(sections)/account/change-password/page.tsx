import type { Metadata } from "next";
import { InfoBox, InfoList, SettingsCard, SettingsPanel } from "../../../_components/settings-ui";
import { ChangePasswordForm } from "./_components/change-password-form";

export const metadata: Metadata = {
  title: "Change Password — Platterly",
  robots: { index: false, follow: false },
};

export default function ChangePasswordPage() {
  return (
    <SettingsCard title="Change Password" description="Update the password you use to sign in.">
      <SettingsPanel>
        <ChangePasswordForm />
      </SettingsPanel>
      <InfoBox tone="info" title="Security Tips">
        <InfoList
          items={[
            "Use a unique password that you don't use elsewhere",
            "Include a mix of letters, numbers, and special characters",
            "Avoid using personal information in your password",
            "Consider using a password manager",
          ]}
        />
      </InfoBox>
    </SettingsCard>
  );
}
