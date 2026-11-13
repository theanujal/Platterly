import { AdminInvitation } from "@/components/account/admin-invitation";
import { AccountShell } from "@/components/account/shell";
import { PageHeader } from "@/components/account/ui";
import { requireAccountHost } from "@/lib/account/guard";

// The page the invitation email opens. It does not force a sign-in first: the person may need to create an account, and the page offers both.
export default async function Page({ searchParams }: { searchParams: Promise<{ invite?: string | string[] }> }) {
  await requireAccountHost();
  const invite = (await searchParams).invite;
  const token = typeof invite === "string" ? invite : "";
  return (
    <AccountShell>
      <PageHeader title="Business Admin invitation" lede="Accept or decline the invitation to become a Business Admin." />
      {token ? <AdminInvitation token={token} /> : <p className="pa-muted" role="status">This invitation link is not complete. Open the link from the email again.</p>}
    </AccountShell>
  );
}
