import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { getIssue } from "@/modules/newsletter/newsletter";
import { listMedia } from "@/modules/site-content/media";
import { IssueForm } from "../forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Newsletter issue" };

export default async function IssuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const issue = await getIssue(id);
  if (!issue) notFound();
  const library = (await listMedia()).map((m) => ({ name: m.name, alt: m.alt }));
  const editable = issue.status === "DRAFT" || issue.status === "SCHEDULED";
  const sendAt = issue.scheduledFor ? new Date(issue.scheduledFor.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 16) : "";
  return (
    <>
      <PageHeader title={issue.subject || "Untitled issue"} description={editable ? "Pictures come from the website picture library. Publish the website after adding a new picture, so it shows in the email." : "This issue is already being sent or was sent, so it is read-only."} />
      <IssueForm issue={{ id: issue.id, subject: issue.subject, body: issue.body, status: issue.status, sendAt, sentCount: issue.sentCount, failedCount: issue.failedCount }} library={library} editable={editable} />
    </>
  );
}
