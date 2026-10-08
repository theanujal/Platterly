import { Badge, Card, Empty, Table, formatWhen } from "@/components/ui";
import { siteStatus } from "@/modules/site-content/publish";
import { PublishButton } from "./forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Website" };

const TONE = { REQUESTED: "warning", SUCCEEDED: "success", FAILED: "danger" } as const;
const LABEL = { REQUESTED: "Building", SUCCEEDED: "Live", FAILED: "Failed" } as const;

export default async function SitePublishPage() {
  const s = await siteStatus();
  const building = s.last?.status === "REQUESTED";
  return (
    <div className="grid max-w-3xl gap-6">
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold">Publish</h2>
          {s.unpublished ? <Badge tone="warning">Unpublished changes</Badge> : <Badge tone="success">Live site is up to date</Badge>}
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Saving a change here does not touch the live site. Publish rebuilds platterly.in from everything saved on the other tabs.
          {s.changedAt ? ` Last change: ${formatWhen(s.changedAt)}.` : ""}{s.lastSuccess ? ` Last published: ${formatWhen(s.lastSuccess.finishedAt ?? s.lastSuccess.requestedAt)}.` : ""}
        </p>
        {s.configured ? null : <p className="mb-4 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">Publishing is not set up on this server yet: SITE_SECRET and SITE_DEPLOY_HOOK_URL are missing.</p>}
        {building ? <p className="mb-4 text-sm text-muted-foreground">A publish is building now. Refresh in a minute.</p> : null}
        <PublishButton disabled={!s.configured || building} />
      </Card>
      <section>
        <h2 className="mb-2 text-base font-semibold">Recent publishes</h2>
        {s.history.length === 0 ? <Empty>Nothing published from here yet.</Empty> : (
          <Table head={["Started", "Result", "Note"]}>
            {s.history.map((p) => (
              <tr key={p.id}>
                <td>{formatWhen(p.requestedAt)}</td>
                <td><Badge tone={TONE[p.status as keyof typeof TONE] ?? "neutral"}>{LABEL[p.status as keyof typeof LABEL] ?? p.status}</Badge></td>
                <td className="text-muted-foreground">{p.message ?? "—"}</td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </div>
  );
}
