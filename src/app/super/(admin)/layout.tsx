import { requireSuperAdminOrRedirect } from "../_lib/guard";
import { SuperAdminNav } from "./_components/nav";
import { SignOutButton } from "./_components/sign-out-button";

// Chunk 3 Group 3.1 — every page under this route group is gated by
// requireSuperAdminOrRedirect(). The `(admin)` segment adds no URL
// path, so no RESERVED_PATH_SEGMENTS entry is needed for it.
export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSuperAdminOrRedirect();

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-neutral-200 px-6 py-3">
        <SuperAdminNav />
        <div className="flex items-center gap-3 text-sm text-neutral-500">
          <span>{session.user.name}</span>
          <SignOutButton />
        </div>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
