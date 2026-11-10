import "server-only";
import { parseNewsletterResult, type NewsletterIssueForSend, type NewsletterTest } from "@platterly/contract";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { signedCall } from "@/modules/account-reviews/account-reviews";

/**
 * Newsletter issues (AJ, 2026-11-10). Staff write and schedule them here (Markdown body, pictures from the website picture library); the Platform holds the
 * subscribers, pulls the next due issue with a signed call and reports what it sent. DRAFT -> SCHEDULED -> SENDING -> SENT. Ops never calls the Platform.
 */
export class NewsletterError extends Error {}

export const MAX_SUBJECT = 200;
export const MAX_BODY = 100_000;
const EDITABLE = ["DRAFT", "SCHEDULED"];
const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;

export const listIssues = () => prisma.newsletterIssue.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
export const getIssue = (id: string) => prisma.newsletterIssue.findUnique({ where: { id } });

export async function createIssue(staffId: string | null): Promise<string> {
  const issue = await prisma.newsletterIssue.create({ data: { subject: "", body: "", createdBy: staffId } });
  await audit({ actorUserId: staffId, action: "newsletter.created", subject: issue.id });
  return issue.id;
}

/** Saves the words. Only a draft or a scheduled issue can be edited; one the Platform has taken is final. */
export async function saveIssue(id: string, input: { subject: string; body: string }, staffId: string | null): Promise<void> {
  const subject = input.subject.trim();
  if (subject.length > MAX_SUBJECT) throw new NewsletterError(`The subject can be at most ${MAX_SUBJECT} characters.`);
  if (input.body.length > MAX_BODY) throw new NewsletterError("The issue is too long.");
  const done = await prisma.newsletterIssue.updateMany({ where: { id, status: { in: EDITABLE } }, data: { subject, body: input.body } });
  if (done.count === 0) throw new NewsletterError("This issue is already being sent or was sent, so it cannot be changed.");
  await audit({ actorUserId: staffId, action: "newsletter.saved", subject: id });
}

/** Schedules a draft (or moves its date). Needs a subject, some text and a time that is not in the past. */
export async function scheduleIssue(id: string, when: Date, staffId: string | null, now = new Date()): Promise<void> {
  const issue = await getIssue(id);
  if (!issue || !EDITABLE.includes(issue.status)) throw new NewsletterError("This issue cannot be scheduled any more.");
  if (!issue.subject.trim() || !issue.body.trim()) throw new NewsletterError("Write a subject and some text before scheduling.");
  if (Number.isNaN(when.getTime()) || when.getTime() < now.getTime() - 60_000) throw new NewsletterError("Choose a time that has not passed.");
  await prisma.newsletterIssue.update({ where: { id }, data: { status: "SCHEDULED", scheduledFor: when } });
  await audit({ actorUserId: staffId, action: "newsletter.scheduled", subject: id, detail: { scheduledFor: when.toISOString() } });
}

export async function unscheduleIssue(id: string, staffId: string | null): Promise<void> {
  const done = await prisma.newsletterIssue.updateMany({ where: { id, status: "SCHEDULED" }, data: { status: "DRAFT", scheduledFor: null } });
  if (done.count === 0) throw new NewsletterError("Only a scheduled issue can be taken back to a draft.");
  await audit({ actorUserId: staffId, action: "newsletter.unscheduled", subject: id });
}

export async function deleteIssue(id: string, staffId: string | null): Promise<void> {
  const done = await prisma.newsletterIssue.deleteMany({ where: { id, status: "DRAFT" } });
  if (done.count === 0) throw new NewsletterError("Only a draft can be deleted.");
  await audit({ actorUserId: staffId, action: "newsletter.deleted", subject: id });
}

/** "Send me a test": the Platform mails the issue as it stands to this staff address the next time it calls (the mail layout lives there). */
export async function requestTest(id: string, to: string, staffId: string | null): Promise<void> {
  if (!EMAIL.test(to)) throw new NewsletterError("There is no email address to send the test to.");
  const issue = await getIssue(id);
  if (!issue || !issue.subject.trim() || !issue.body.trim()) throw new NewsletterError("Write a subject and some text, and save, before sending a test.");
  await prisma.newsletterIssue.update({ where: { id }, data: { testTo: to.toLowerCase() } });
  await audit({ actorUserId: staffId, action: "newsletter.test_requested", subject: id });
}

export async function nextForPlatform(now = new Date()): Promise<{ issue: NewsletterIssueForSend | null; tests: NewsletterTest[] }> {
  const testRows = await prisma.newsletterIssue.findMany({ where: { testTo: { not: null } }, orderBy: { updatedAt: "asc" }, take: 20 });
  const tests = testRows.filter((r) => r.testTo && r.subject.trim()).map((r) => ({ issueId: r.id, subject: r.subject, body: r.body, to: r.testTo as string }));
  // One already being sent is finished first; otherwise the oldest due issue is taken (and cannot be taken twice: the status change is the claim).
  let row = await prisma.newsletterIssue.findFirst({ where: { status: "SENDING" }, orderBy: { scheduledFor: "asc" } });
  if (!row) {
    const due = await prisma.newsletterIssue.findFirst({ where: { status: "SCHEDULED", scheduledFor: { lte: now } }, orderBy: { scheduledFor: "asc" } });
    if (due) {
      const claimed = await prisma.newsletterIssue.updateMany({ where: { id: due.id, status: "SCHEDULED" }, data: { status: "SENDING" } });
      if (claimed.count > 0) row = { ...due, status: "SENDING" };
    }
  }
  return { issue: row ? { issueId: row.id, subject: row.subject, body: row.body } : null, tests };
}

export const handleNewsletterNext = (request: Request) => signedCall(request, async () => ({ status: 200, body: await nextForPlatform() }));

export const handleNewsletterResult = (request: Request) =>
  signedCall(request, async (json) => {
    const parsed = parseNewsletterResult(json);
    if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
    const r = parsed.value;
    if (r.kind === "test") {
      const done = await prisma.newsletterIssue.updateMany({ where: { id: r.issueId, testTo: { not: null } }, data: { testTo: null } });
      return done.count > 0 ? { status: 200, body: { ok: true } } : { status: 404, body: { error: "unknown_issue" } };
    }
    const issue = await prisma.newsletterIssue.findUnique({ where: { id: r.issueId }, select: { status: true } });
    if (!issue || issue.status !== "SENDING") return { status: issue ? 409 : 404, body: { error: issue ? "not_sending" : "unknown_issue" } };
    await prisma.newsletterIssue.update({
      where: { id: r.issueId },
      data: { sentCount: { increment: r.sent }, failedCount: { increment: r.failed }, ...(r.done ? { status: "SENT", sentAt: new Date() } : {}) },
    });
    if (r.done) await audit({ actorUserId: null, action: "newsletter.sent", subject: r.issueId, detail: { sent: r.sent, failed: r.failed } });
    return { status: 200, body: { ok: true } };
  });
