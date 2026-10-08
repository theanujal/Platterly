import "server-only";
import { signedHeaders } from "@platterly/contract";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { notifySafely } from "@/modules/notifications/notifications";

/**
 * Publishing the site. The site is built into plain files, so a change only goes live when it is rebuilt: Publish asks the
 * web server's deploy hook (SITE_DEPLOY_HOOK_URL, signed with SITE_SECRET) to rebuild. The deploy script (scripts/site-deploy.sh)
 * reports back to /api/site/publish-result, which marks the row SUCCEEDED or FAILED.
 */
export class SitePublishError extends Error {}

/** A publish that has not reported back after this long no longer blocks a new one. */
const STALE_AFTER_MS = 30 * 60 * 1000;
const HOOK_TIMEOUT_MS = 10_000;

export const siteSecret = () => process.env.SITE_SECRET ?? "";

export async function publishSite(staffId: string | null, now = new Date()) {
  const secret = siteSecret();
  const hook = process.env.SITE_DEPLOY_HOOK_URL ?? "";
  if (!secret || !hook) throw new SitePublishError("Publishing is not set up on this server yet (SITE_SECRET and SITE_DEPLOY_HOOK_URL).");
  const running = await prisma.sitePublish.findFirst({ where: { status: "REQUESTED", requestedAt: { gt: new Date(now.getTime() - STALE_AFTER_MS) } } });
  if (running) throw new SitePublishError("A publish is already running. Wait for it to finish.");

  const publish = await prisma.sitePublish.create({ data: { requestedBy: staffId, requestedAt: now } });
  const body = JSON.stringify({ publishId: publish.id });
  try {
    const response = await fetch(hook, { method: "POST", headers: signedHeaders(secret, publish.id, body), body, signal: AbortSignal.timeout(HOOK_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`The deploy hook answered ${response.status}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The deploy hook could not be reached.";
    await prisma.sitePublish.update({ where: { id: publish.id }, data: { status: "FAILED", message, finishedAt: new Date() } });
    await audit({ actorUserId: staffId, action: "site.publish.failed", subject: publish.id, detail: { message } });
    throw new SitePublishError(message);
  }
  await audit({ actorUserId: staffId, action: "site.publish.requested", subject: publish.id });
  return publish;
}

/** The deploy script's answer. Only a publish that is still waiting can be answered, once. */
export async function recordPublishResult(publishId: string, ok: boolean, message: string | null): Promise<boolean> {
  const done = await prisma.sitePublish.updateMany({
    where: { id: publishId, status: "REQUESTED" },
    data: { status: ok ? "SUCCEEDED" : "FAILED", message: message?.slice(0, 500) ?? null, finishedAt: new Date() },
  });
  if (done.count) await notifySafely({ kind: "site.publish", severity: ok ? "INFO" : "WARNING", title: ok ? "Website published" : "Website publish failed", body: ok ? "platterly.in now shows the latest text." : (message ?? "The build failed."), link: "/site", dedupeKey: `site_publish:${publishId}` });
  if (done.count) await audit({ actorUserId: null, action: ok ? "site.publish.succeeded" : "site.publish.failed", subject: publishId, detail: { message } });
  return done.count > 0;
}

export async function siteStatus() {
  const [changedRow, last, lastSuccess, history] = await Promise.all([
    prisma.siteSetting.findUnique({ where: { key: "changed" } }),
    prisma.sitePublish.findFirst({ orderBy: { requestedAt: "desc" } }),
    prisma.sitePublish.findFirst({ where: { status: "SUCCEEDED" }, orderBy: { requestedAt: "desc" } }),
    prisma.sitePublish.findMany({ orderBy: { requestedAt: "desc" }, take: 10 }),
  ]);
  const changedAt = changedRow ? new Date((changedRow.value as { at: string }).at) : null;
  // Nothing was ever changed: nothing to publish. Changed but never published: there is.
  const unpublished = changedAt ? !lastSuccess || changedAt > lastSuccess.requestedAt : false;
  return { changedAt, unpublished, last, lastSuccess, history, configured: Boolean(siteSecret() && process.env.SITE_DEPLOY_HOOK_URL) };
}
