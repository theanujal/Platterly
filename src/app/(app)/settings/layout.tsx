import { requireActiveOrganization } from "@/lib/auth/require-session";
import { SettingsNav } from "./_components/settings-nav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireActiveOrganization();

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <SettingsNav />
      <div className="min-w-0 flex-1 p-8">{children}</div>
    </div>
  );
}
