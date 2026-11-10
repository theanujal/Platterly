import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { newId, requestTarget, signedHeaders, verifyRequest } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { POST as nextPOST } from "@/app/api/platform/newsletter/next/route";
import { POST as resultPOST } from "@/app/api/platform/newsletter/result/route";
import { NewsletterError, createIssue, deleteIssue, requestTest, saveIssue, scheduleIssue, unscheduleIssue } from "../newsletter";

// Staff write and schedule issues; the Platform pulls the next due one and reports what it sent.
const SECRET = "platform-billing-secret-0123456789abcdef0123";
const BASE = "http://ops.localhost:3200";
const saved: Record<string, string | undefined> = {};
const ids: string[] = [];

beforeAll(() => { saved.PLATFORM_BILLING_SECRETS = process.env.PLATFORM_BILLING_SECRETS; });
beforeEach(() => { process.env.PLATFORM_BILLING_SECRETS = SECRET; });
afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { subject: { in: ids }, action: { startsWith: "newsletter." } } });
  await prisma.newsletterIssue.deleteMany({ where: { id: { in: ids } } });
  ids.length = 0;
});
afterAll(() => {
  if (saved.PLATFORM_BILLING_SECRETS === undefined) delete process.env.PLATFORM_BILLING_SECRETS;
  else process.env.PLATFORM_BILLING_SECRETS = saved.PLATFORM_BILLING_SECRETS;
});

const made = async (data: { subject?: string; body?: string; status?: string; scheduledFor?: Date | null } = {}) => {
  const row = await prisma.newsletterIssue.create({ data: { subject: "Hello", body: "# Hi", ...data } });
  ids.push(row.id);
  return row;
};
const call = (handler: (r: Request) => Promise<Response>, path: string, payload: unknown, secret: string | null = SECRET) => {
  const text = JSON.stringify(payload);
  const url = `${BASE}${path}`;
  const id = newId("command");
  return { id, response: handler(new Request(url, { method: "POST", body: text, headers: { "content-type": "application/json", ...(secret ? signedHeaders(secret, id, text, { target: requestTarget("POST", url) }) : {}) } })) };
};
const next = async () => (await call(nextPOST, "/api/platform/newsletter/next", {}).response).json() as Promise<{ issue: { issueId: string; subject: string; body: string } | null; tests: { issueId: string; to: string }[] }>;
const report = (payload: Record<string, unknown>) => call(resultPOST, "/api/platform/newsletter/result", payload).response;
const past = () => new Date(Date.now() - 60_000);

describe("newsletter issues (staff side)", () => {
  it("a new issue is a draft; it can be saved, scheduled, taken back and deleted", async () => {
    const id = await createIssue(null);
    ids.push(id);
    await saveIssue(id, { subject: "  May news ", body: "Hello there" }, null);
    expect(await prisma.newsletterIssue.findUnique({ where: { id } })).toMatchObject({ subject: "May news", body: "Hello there", status: "DRAFT" });
    await scheduleIssue(id, new Date(Date.now() + 3_600_000), null);
    expect((await prisma.newsletterIssue.findUnique({ where: { id } }))?.status).toBe("SCHEDULED");
    await unscheduleIssue(id, null);
    expect(await prisma.newsletterIssue.findUnique({ where: { id } })).toMatchObject({ status: "DRAFT", scheduledFor: null });
    await deleteIssue(id, null);
    expect(await prisma.newsletterIssue.findUnique({ where: { id } })).toBeNull();
  });

  it("refuses to schedule an empty issue or a time in the past, and to delete or edit one the Platform has taken", async () => {
    const empty = await made({ subject: "", body: "" });
    await expect(scheduleIssue(empty.id, new Date(Date.now() + 3_600_000), null)).rejects.toThrow(NewsletterError);
    const ready = await made();
    await expect(scheduleIssue(ready.id, new Date(Date.now() - 3_600_000), null)).rejects.toThrow("not passed");
    const sending = await made({ status: "SENDING", scheduledFor: past() });
    await expect(saveIssue(sending.id, { subject: "x", body: "y" }, null)).rejects.toThrow("already being sent");
    await expect(deleteIssue(sending.id, null)).rejects.toThrow("Only a draft");
  });
});

describe("the Platform pulls and reports (signed)", () => {
  it("answers 401 to an unsigned or wrongly signed call", async () => {
    expect((await call(nextPOST, "/api/platform/newsletter/next", {}, null).response).status).toBe(401);
    expect((await call(nextPOST, "/api/platform/newsletter/next", {}, "another-secret-0123456789abcdef0123456").response).status).toBe(401);
  });

  it("hands over a due issue once it is scheduled, not a draft or a future one, and marks it SENDING; asked again it is the same issue", async () => {
    const draft = await made();
    const later = await made({ status: "SCHEDULED", scheduledFor: new Date(Date.now() + 3_600_000) });
    const due = await made({ status: "SCHEDULED", scheduledFor: past(), subject: "Due one", body: "Body" });
    const first = await next();
    expect(first.issue).toEqual({ issueId: due.id, subject: "Due one", body: "Body" });
    expect((await prisma.newsletterIssue.findUnique({ where: { id: due.id } }))?.status).toBe("SENDING");
    expect((await next()).issue?.issueId).toBe(due.id);
    expect((await prisma.newsletterIssue.findUnique({ where: { id: draft.id } }))?.status).toBe("DRAFT");
    expect((await prisma.newsletterIssue.findUnique({ where: { id: later.id } }))?.status).toBe("SCHEDULED");
    const res = await call(nextPOST, "/api/platform/newsletter/next", {}).response;
    expect(verifyRequest([SECRET], res.headers, await res.clone().text()).ok).toBe(true);
  });

  it("adds up what each batch sent and marks the issue SENT when the Platform says it is done", async () => {
    const issue = await made({ status: "SENDING", scheduledFor: past() });
    expect((await report({ issueId: issue.id, kind: "send", sent: 150, failed: 2, done: false })).status).toBe(200);
    expect(await prisma.newsletterIssue.findUnique({ where: { id: issue.id } })).toMatchObject({ status: "SENDING", sentCount: 150, failedCount: 2, sentAt: null });
    expect((await report({ issueId: issue.id, kind: "send", sent: 40, failed: 0, done: true })).status).toBe(200);
    const row = await prisma.newsletterIssue.findUnique({ where: { id: issue.id } });
    expect(row).toMatchObject({ status: "SENT", sentCount: 190, failedCount: 2 });
    expect(row?.sentAt).not.toBeNull();
    expect((await report({ issueId: issue.id, kind: "send", sent: 1, failed: 0, done: true })).status).toBe(409);
    expect((await report({ issueId: "nope", kind: "send", sent: 1, failed: 0, done: true })).status).toBe(404);
    expect((await report({ issueId: issue.id, kind: "send", sent: -1, failed: 0, done: true })).status).toBe(400);
  });

  it("a test request is handed to the Platform for that address and cleared when the Platform says it went out", async () => {
    const issue = await made();
    await requestTest(issue.id, "Staff@Platterly.in", null);
    const answer = await next();
    expect(answer.tests.find((t) => t.issueId === issue.id)).toMatchObject({ to: "staff@platterly.in" });
    expect((await report({ issueId: issue.id, kind: "test", sent: 1, failed: 0, done: true })).status).toBe(200);
    expect((await next()).tests.find((t) => t.issueId === issue.id)).toBeUndefined();
    await expect(requestTest(issue.id, "not an email", null)).rejects.toThrow("no email address");
    const blank = await made({ subject: "", body: "" });
    await expect(requestTest(blank.id, "staff@platterly.in", null)).rejects.toThrow("Write a subject");
  });
});
