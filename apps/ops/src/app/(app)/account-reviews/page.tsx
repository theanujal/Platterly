import { ShieldCheck } from "lucide-react";
import { Badge, Button, Empty, PageHeader, formatWhen } from "@/components/ui";
import { listAccountReviews } from "@/modules/account-reviews/account-reviews";
import { clearAccountReviewAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account reviews" };

const REASON = { not_me: "Says it was not them", mistake: "Says it was a mistake", other: "Another reason" } as const;

export default async function AccountReviewsPage() {
  const rows = await listAccountReviews();
  return (
    <>
      <PageHeader title="Account reviews" description="An email change was cancelled by the old address, so the account is on hold. Verify the person, then release it." />
      {rows.length === 0 ? (
        <Empty><ShieldCheck className="mx-auto mb-2 size-5" aria-hidden />Nothing to review.</Empty>
      ) : (
        <ul className="divide-y divide-border rounded-xl bg-card shadow-[0_0_0_1px_rgba(17,24,39,0.1)]">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{r.oldEmail} <span className="font-normal text-muted-foreground">tried to become</span> {r.newEmail}</p>
                  <Badge tone={r.status === "OPEN" ? "warning" : "success"}>{r.status === "OPEN" ? "On hold" : "Verified"}</Badge>
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">{REASON[r.reason as keyof typeof REASON] ?? r.reason}{r.note ? `: “${r.note}”` : ""}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Cancelled {formatWhen(r.requestedAt)}{r.clearedAt ? ` · verified ${formatWhen(r.clearedAt)}` : ""}</p>
              </div>
              {r.status === "OPEN" ? <form action={clearAccountReviewAction}><input type="hidden" name="id" value={r.id} /><Button type="submit" variant="outline" size="md">Verified: release the hold</Button></form> : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
