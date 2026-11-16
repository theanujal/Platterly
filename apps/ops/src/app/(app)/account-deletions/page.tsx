import { UserX } from "lucide-react";
import { Badge, Empty, PageHeader, formatWhen } from "@/components/ui";
import { isStaleApproving, listAccountDeletions } from "@/modules/account-deletions/account-deletions";
import { DecideForms, EraseForm, RestoreForm } from "./deletion-forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account deletions" };

const TONE = { PENDING: "warning", APPROVING: "warning", APPROVED: "danger", DECLINED: "neutral", WITHDRAWN: "neutral", RESTORED: "success", ERASED: "neutral" } as const;
const LABEL = { PENDING: "Waiting for you", APPROVING: "Being approved", APPROVED: "Approved: suspended", DECLINED: "Declined", WITHDRAWN: "Withdrawn by the person", RESTORED: "Restored", ERASED: "Erased" } as const;

export default async function AccountDeletionsPage() {
  const rows = await listAccountDeletions();
  return (
    <>
      <PageHeader title="Account deletions" description="People who asked to delete their Platterly account. A business Admin's request covers the business too. Nothing is deleted until you approve it." />
      {rows.length === 0 ? (
        <Empty><UserX className="mx-auto mb-2 size-5" aria-hidden />No deletion requests.</Empty>
      ) : (
        <ul className="divide-y divide-border rounded-xl bg-card shadow-[0_0_0_1px_rgba(17,24,39,0.1)]">
          {rows.map((r) => {
            const status = r.status as keyof typeof LABEL;
            const products = Array.isArray(r.products) ? (r.products as string[]) : [];
            return (
              <li key={r.id} className="p-4" data-testid={`deletion-${r.requestId}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{r.name || r.email}</p>
                  <Badge tone={TONE[status] ?? "neutral"}>{LABEL[status] ?? r.status}</Badge>
                </div>
                <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  <div><dt className="inline text-muted-foreground">Email: </dt><dd className="inline">{r.email}</dd></div>
                  <div><dt className="inline text-muted-foreground">Phone: </dt><dd className="inline">{r.phone || "Not given"}</dd></div>
                  <div><dt className="inline text-muted-foreground">Business: </dt><dd className="inline">{r.businessName ?? "None (no business)"}</dd></div>
                  <div><dt className="inline text-muted-foreground">Products: </dt><dd className="inline">{products.length ? products.join(", ") : "None"}</dd></div>
                  <div><dt className="inline text-muted-foreground">Asked: </dt><dd className="inline">{formatWhen(r.requestedAt)}</dd></div>
                  {r.eraseAfter ? <div><dt className="inline text-muted-foreground">Restorable until: </dt><dd className="inline">{formatWhen(r.eraseAfter)}</dd></div> : null}
                </dl>
                {r.reason ? <p className="mt-2 text-sm text-muted-foreground">Reason given: “{r.reason}”</p> : null}
                {r.declineReason ? <p className="mt-2 text-sm text-muted-foreground">Declined because: “{r.declineReason}”</p> : null}
                {status === "APPROVING" && isStaleApproving(r) ? <p className="mt-3 text-sm text-muted-foreground">An earlier approve was cut off. Approve again to finish it, or decline to bring the business back.</p> : null}
                {status === "PENDING" || isStaleApproving(r) ? <DecideForms id={r.id} hasBusiness={!!r.businessId} /> : null}
                {status === "APPROVED" && !r.eraseRequestedAt ? <RestoreForm id={r.id} /> : null}
                {status === "APPROVED" && !r.eraseRequestedAt ? <EraseForm id={r.id} email={r.email} /> : null}
                {status === "APPROVED" && r.eraseRequestedAt ? <p className="mt-3 text-sm text-muted-foreground">Erase started {formatWhen(r.eraseRequestedAt)}. Waiting for the Platform to remove the person.</p> : null}
                {status === "ERASED" ? <p className="mt-3 text-sm text-muted-foreground">Erased {r.erasedAt ? formatWhen(r.erasedAt) : ""}. Invoices and payments are kept without contact details.</p> : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
