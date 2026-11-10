import { fail, isRecord, ok, type ParseResult } from "./result";

/**
 * Newsletter (AJ, 2026-11-10). Staff write and schedule each issue in Ops; the Platform holds the subscribers and does the sending. Ops never calls the Platform,
 * so the Platform pulls the next due issue and reports what it sent. Both calls are signed POSTs with the platform-billing secret, and the answers are signed by Ops.
 *   POST /api/platform/newsletter/next    {}                                  -> {issue: NewsletterIssueForSend | null, tests: NewsletterTest[]}
 *        (marks the issue SENDING; asked again, the same issue. `tests` are "send me a test" requests staff made, each for one address.)
 *   POST /api/platform/newsletter/result  {issueId, kind, sent, failed, done} -> {ok: true}
 *        (kind "send": done = every subscriber has been tried, Ops marks it SENT. kind "test": the test mail went out, Ops clears the request.)
 * The body is Markdown, as the Ops editor writes it. Pictures are written `/uploads/<name>` and the Platform turns them into full addresses.
 */
export const PLATFORM_NEWSLETTER_NEXT_PATH = "/api/platform/newsletter/next";
export const PLATFORM_NEWSLETTER_RESULT_PATH = "/api/platform/newsletter/result";

export interface NewsletterIssueForSend {
  issueId: string;
  subject: string;
  /** Markdown, at most 100,000 characters. */
  body: string;
}

/** A "send me a test" request: the issue as it stands, for one staff address (not a subscriber). */
export interface NewsletterTest extends NewsletterIssueForSend {
  to: string;
}

export interface NewsletterResultRequest {
  issueId: string;
  kind: "send" | "test";
  /** How many people were sent this issue by this batch run. */
  sent: number;
  failed: number;
  /** True when no subscriber is left to send to. */
  done: boolean;
}

const text = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
const count = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 10_000_000;

export function parseNewsletterIssue(input: unknown): ParseResult<NewsletterIssueForSend> {
  if (!isRecord(input)) return fail("the issue must be an object");
  const { issueId, subject, body } = input;
  if (!text(issueId, 100) || !issueId) return fail("issueId is required");
  if (!text(subject, 200) || !subject.trim()) return fail("subject is required");
  if (!text(body, 100_000)) return fail("body must be text of at most 100,000 characters");
  return ok({ issueId, subject: subject.trim(), body });
}

export function parseNewsletterTest(input: unknown): ParseResult<NewsletterTest> {
  const issue = parseNewsletterIssue(input);
  if (!issue.ok) return issue;
  const to = (input as { to?: unknown }).to;
  if (typeof to !== "string" || to.length > 254 || !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/.test(to)) return fail("to must be an email address");
  return ok({ ...issue.value, to });
}

export function parseNewsletterResult(input: unknown): ParseResult<NewsletterResultRequest> {
  if (!isRecord(input)) return fail("the request must be an object");
  const { issueId, kind, sent, failed, done } = input;
  if (!text(issueId, 100) || !issueId) return fail("issueId is required");
  if (kind !== "send" && kind !== "test") return fail("kind must be send or test");
  if (!count(sent) || !count(failed)) return fail("sent and failed must be whole numbers");
  if (typeof done !== "boolean") return fail("done must be true or false");
  return ok({ issueId, kind, sent, failed, done });
}
