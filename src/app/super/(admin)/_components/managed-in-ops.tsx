import { opsBillingOn, opsLink } from "@/modules/ops-link/config";

/**
 * Shown on the Super Admin screens whose data moved to Platterly Ops (plans, assigning a plan, the seller's billing
 * details). Renders nothing while OPS_BILLING is off, so these screens work exactly as before.
 */
export function ManagedInOps({ what }: { what: string }) {
  if (!opsBillingOn()) return null;
  const href = process.env.OPS_PUBLIC_URL?.trim() || opsLink()?.baseUrl;
  return (
    <div role="status" className="rounded-lg border border-info/30 bg-info/10 p-4 text-sm text-info" data-testid="managed-in-ops">
      <p className="font-semibold">{what} are managed in Platterly Ops now.</p>
      <p className="mt-1">
        {href ? (
          <>
            Open <a className="underline" href={href}>Ops</a> to change them. Changes made here are refused so the two never disagree.
          </>
        ) : (
          "Change them in Ops. Changes made here are refused so the two never disagree."
        )}
      </p>
    </div>
  );
}
