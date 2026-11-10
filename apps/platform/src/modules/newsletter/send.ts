import { PLATFORM_NEWSLETTER_NEXT_PATH, PLATFORM_NEWSLETTER_RESULT_PATH, parseNewsletterIssue, parseNewsletterTest, type NewsletterIssueForSend } from "@platterly/contract";
import type { Pool } from "pg";
import { ROOT_DOMAIN } from "@/lib/routing/hosts";
import { accountOrigin } from "../auth/config";
import { renderEmail } from "../auth/email-layout";
import { sendAuthEmail, type AuthEmail } from "../auth/mailer";
import { opsPost } from "../account/hold";
import { newsletterText, renderNewsletterBody } from "./markdown";
import { unsubscribeUrl } from "./unsubscribe";

// Newsletter sending (AJ, 2026-11-10). Called by the cron route. Ops holds the issues; this asks Ops for the next one that is due, mails it to everyone who has the newsletter
// switched on (verified email, no open account hold) in batches, and tells Ops how many went out. Each person is claimed in "newsletterDelivery" BEFORE the mail is sent, so
// a repeated, overlapping or interrupted run never mails anyone twice (at most once; a crash mid-send leaves that one person unsent, not doubled).
export const DEFAULT_BATCH = 100;

type Deps = { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch; now?: number; send?: (mail: AuthEmail) => Promise<void>; batch?: number; secret?: string };
export type NewsletterRun = { status: "ok" | "not_configured" | "unreachable" | "refused" | "bad_answer" | "unknown"; tests: number; sent: number; failed: number; done: boolean; issueId: string | null };

const imageBase = (env: NodeJS.ProcessEnv) => env.NEWSLETTER_IMAGE_BASE || (ROOT_DOMAIN.startsWith("localhost") ? "http://localhost:3100" : `https://${ROOT_DOMAIN}`);

function compose(issue: NewsletterIssueForSend, to: string, unsubscribe: string, env: NodeJS.ProcessEnv): AuthEmail {
  const base = imageBase(env);
  return {
    to,
    subject: issue.subject,
    html: renderEmail({
      tag: "Newsletter",
      eyebrow: "Platterly news",
      title: issue.subject,
      greeting: "Hello,",
      bodyHtml: renderNewsletterBody(issue.body, base),
      unsubscribeUrl: unsubscribe,
      unsubscribeNote: "You will still get messages about your account.",
    }),
    text: `${newsletterText(issue.body, base)}\n\nUnsubscribe: ${unsubscribe}`,
  };
}

export async function runNewsletter(pool: Pool, deps: Deps = {}): Promise<NewsletterRun> {
  const env = deps.env ?? process.env;
  const secret = deps.secret ?? env.AUTH_SECRET ?? "";
  const send = deps.send ?? ((mail: AuthEmail) => sendAuthEmail(mail, env));
  const out: NewsletterRun = { status: "ok", tests: 0, sent: 0, failed: 0, done: false, issueId: null };
  const got = await opsPost(PLATFORM_NEWSLETTER_NEXT_PATH, {}, { env, fetchImpl: deps.fetchImpl, now: deps.now });
  if (!got.ok) return { ...out, status: got.reason };

  // "Send me a test": one staff address, the issue as it stands, a sample unsubscribe link (the real one is per person).
  for (const raw of Array.isArray(got.value.tests) ? got.value.tests : []) {
    const test = parseNewsletterTest(raw);
    if (!test.ok) continue;
    try {
      await send(compose(test.value, test.value.to, unsubscribeUrl(accountOrigin(), secret, "test"), env));
      out.tests++;
      await opsPost(PLATFORM_NEWSLETTER_RESULT_PATH, { issueId: test.value.issueId, kind: "test", sent: 1, failed: 0, done: true }, { env, fetchImpl: deps.fetchImpl, now: deps.now });
    } catch (error) {
      console.error("newsletter test failed", error instanceof Error ? error.message : "unknown");
    }
  }

  if (!got.value.issue) return out;
  const parsed = parseNewsletterIssue(got.value.issue);
  if (!parsed.ok) return { ...out, status: "bad_answer" };
  const issue = parsed.value;
  out.issueId = issue.issueId;

  const { rows } = await pool.query(
    `select u."id", u."email" from "user" u join "accountProfile" p on p."userId" = u."id"
      where p."notifyProductUpdates" = true and u."emailVerified" = true
        and not exists (select 1 from "accountHold" h where h."userId" = u."id" and h."liftedAt" is null)
        and not exists (select 1 from "newsletterDelivery" d where d."issueId" = $1 and d."userId" = u."id")
      order by u."id" limit $2`,
    [issue.issueId, deps.batch ?? (Number(env.NEWSLETTER_BATCH) || DEFAULT_BATCH)],
  );
  for (const person of rows as { id: string; email: string }[]) {
    const claim = await pool.query(`insert into "newsletterDelivery" ("issueId", "userId", "status") values ($1, $2, 'pending') on conflict do nothing`, [issue.issueId, person.id]);
    if (!claim.rowCount) continue; // another run took this person
    try {
      await send(compose(issue, person.email, unsubscribeUrl(accountOrigin(), secret, person.id), env));
      await pool.query(`update "newsletterDelivery" set "status" = 'sent', "at" = now() where "issueId" = $1 and "userId" = $2`, [issue.issueId, person.id]);
      out.sent++;
    } catch (error) {
      await pool.query(`update "newsletterDelivery" set "status" = 'failed', "at" = now() where "issueId" = $1 and "userId" = $2`, [issue.issueId, person.id]);
      out.failed++;
      console.error("newsletter send failed", error instanceof Error ? error.constructor.name : "unknown");
    }
  }
  const remaining = await pool.query(
    `select count(*)::int as n from "user" u join "accountProfile" p on p."userId" = u."id"
      where p."notifyProductUpdates" = true and u."emailVerified" = true
        and not exists (select 1 from "accountHold" h where h."userId" = u."id" and h."liftedAt" is null)
        and not exists (select 1 from "newsletterDelivery" d where d."issueId" = $1 and d."userId" = u."id")`,
    [issue.issueId],
  );
  out.done = remaining.rows[0].n === 0;
  await opsPost(PLATFORM_NEWSLETTER_RESULT_PATH, { issueId: issue.issueId, kind: "send", sent: out.sent, failed: out.failed, done: out.done }, { env, fetchImpl: deps.fetchImpl, now: deps.now });
  return out;
}
