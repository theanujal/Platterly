/* eslint-disable @next/next/no-img-element */
import { Empty } from "@/components/ui";
import { listMedia, mediaUsage } from "@/modules/site-content/media";
import { deleteMediaAction } from "../actions";
import { AltForm } from "../forms";
import { Uploader } from "./uploader";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pictures" };

const size = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export default async function MediaPage() {
  const media = await listMedia();
  const usage = await Promise.all(media.map((m) => mediaUsage(m.name)));
  return (
    <div className="grid gap-6">
      <section className="grid max-w-2xl gap-2">
        <p className="text-sm text-muted-foreground">Pictures for posts and pages. Add them here, or straight from the editor&apos;s picture button. They are stored on the Ops server and copied into the site when it is published.</p>
        <Uploader />
      </section>
      {media.length === 0 ? <Empty>No pictures yet.</Empty> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
          {media.map((m, i) => (
            <section key={m.id} className="flex flex-col overflow-hidden rounded-[14px] bg-card shadow-[0_0_0_1px_rgba(17,24,39,0.1)]">
              <div className="aspect-video bg-muted"><img src={`/uploads/${m.name}`} alt={m.alt || m.originalName} className="size-full object-cover" loading="lazy" /></div>
              <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="min-w-0"><p className="truncate text-sm font-semibold" title={m.originalName}>{m.originalName}</p><p className="font-mono text-xs text-muted-foreground">/uploads/{m.name}</p><p className="text-xs text-muted-foreground">{size(m.bytes)}</p></div>
                <AltForm name={m.name} alt={m.alt} />
                <p className="text-xs text-muted-foreground">{usage[i].length === 0 ? "Not used anywhere yet." : `Used by ${usage[i].join(", ")}`}</p>
                <form action={deleteMediaAction} className="mt-auto"><input type="hidden" name="name" value={m.name} /><button type="submit" disabled={usage[i].length > 0} className="text-sm text-destructive hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline" title={usage[i].length > 0 ? "Remove it from the pages that use it first" : undefined}>Delete</button></form>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
