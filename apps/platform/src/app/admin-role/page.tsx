import { AdminRole } from "@/components/account/admin-role";
import { PageHeader } from "@/components/account/ui";
import { AccountShell } from "@/components/account/shell";
import { requireAccountSignIn } from "@/lib/account/guard";

export default async function Page() {
  await requireAccountSignIn("/admin-role");
  return (
    <AccountShell>
      <PageHeader title="Admin role" lede="Hand the Business Admin role of your business to someone else. Your password and, if it is on, your two-step code are asked for." />
      <AdminRole />
    </AccountShell>
  );
}
