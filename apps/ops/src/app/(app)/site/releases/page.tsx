import { Badge, Empty } from "@/components/ui";
import { listSiteReleases } from "@/modules/site-content/site-content";
import { deleteReleaseAction } from "../actions";
import { ReleaseForm } from "../forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "What's new" };

export default async function ReleasesPage() {
  const releases = await listSiteReleases();
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="grid max-w-3xl gap-6">
      <section>
        <h2 className="mb-2 text-base font-semibold">Add an update</h2>
        <ReleaseForm isNew values={{ id: "", date: today, title: "", body: "", kind: "new" }} />
      </section>
      <section className="grid gap-3">
        <h2 className="text-base font-semibold">Updates on the site</h2>
        {releases.length === 0 ? <Empty>No updates yet.</Empty> : null}
        {releases.map((r) => (
          <details key={r.id} className="group rounded-xl bg-card shadow-[0_0_0_1px_rgba(17,24,39,0.1)]">
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 p-4 text-sm">
              <span className="font-medium">{r.title}</span>
              <Badge tone={r.kind === "new" ? "success" : "info"}>{r.kind === "new" ? "New" : "Improved"}</Badge>
              <span className="ml-auto text-muted-foreground">{r.date}</span>
            </summary>
            <div className="grid gap-3 border-t p-4">
              <ReleaseForm isNew={false} values={r} />
              <form action={deleteReleaseAction}><input type="hidden" name="id" value={r.id} /><button type="submit" className="text-sm text-destructive hover:underline">Delete this update</button></form>
            </div>
          </details>
        ))}
      </section>
    </div>
  );
}
