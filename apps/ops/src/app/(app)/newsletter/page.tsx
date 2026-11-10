import { Mail } from "lucide-react";
import Link from "next/link";
import { Badge, Button, Empty, PageHeader, formatWhen } from "@/components/ui";
import { listIssues } from "@/modules/newsletter/newsletter";
import { newIssueAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Newsletter" };

const TONE = { DRAFT: "neutral", SCHEDULED: "info", SENDING: "warning", SENT: "success" } as const;
const LABEL = { DRAFT: "Draft", SCHEDULED: "Scheduled", SENDING: "Sending", SENT: "Sent" } as const;

export default async function NewsletterPage() {
  const issues = await listIssues();
  return (
    <>
      <PageHeader
        title="Newsletter"
        description="Write an issue, send yourself a test, and schedule it. It goes to everyone who has switched the newsletter on in their Account."
        actions={<form action={newIssueAction}><Button type="submit">New issue</Button></form>}
      />
      {issues.length === 0 ? (
        <Empty><Mail className="mx-auto mb-2 size-5" aria-hidden />No issues yet.</Empty>
      ) : (
        <ul className="divide-y divide-border rounded-xl bg-card shadow-[0_0_0_1px_rgba(17,24,39,0.1)]">
          {issues.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <Link href={`/newsletter/${i.id}`} className="text-sm font-semibold hover:underline">{i.subject || "Untitled issue"}</Link>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {i.status === "SCHEDULED" ? `Goes out ${formatWhen(i.scheduledFor)}` : i.status === "SENT" ? `Sent ${formatWhen(i.sentAt)} to ${i.sentCount} people${i.failedCount ? `, ${i.failedCount} failed` : ""}` : i.status === "SENDING" ? `Sending: ${i.sentCount} sent so far` : `Created ${formatWhen(i.createdAt)}`}
                </p>
              </div>
              <Badge tone={TONE[i.status as keyof typeof TONE] ?? "neutral"}>{LABEL[i.status as keyof typeof LABEL] ?? i.status}</Badge>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
