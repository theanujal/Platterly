import { Badge, Empty } from "@/components/ui";
import { listSiteScripts } from "@/modules/site-content/site-content";
import { deleteScriptAction } from "../actions";
import { ScriptForm } from "../forms";
import { ScriptSwitch } from "./script-switch";

export const dynamic = "force-dynamic";
export const metadata = { title: "Scripts" };

const KIND_LABEL = { essential: "Essential", analytics: "Analytics", marketing: "Marketing" } as const;
const KIND_TONE = { essential: "neutral", analytics: "info", marketing: "warning" } as const;
const PLACE_LABEL = { head: "Head", body: "Start of body", footer: "Footer" } as const;

export default async function ScriptsPage() {
  const scripts = await listSiteScripts();
  return (
    <div className="grid gap-6">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Tags for platterly.in only, never the products: Google Analytics, Tag Manager, Microsoft Clarity, a Meta Pixel and the like. Analytics and Marketing scripts run only after a visitor accepts that kind in the cookie notice, which lists them by name; with none of those on there is no notice. Changes go live on Publish.
      </p>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section>
          <h2 className="mb-2 text-base font-semibold">Add a script</h2>
          <ScriptForm isNew values={{ id: "", name: "", kind: "analytics", placement: "head", enabled: false, code: "", cookies: "", description: "" }} />
        </section>
        <section className="grid gap-3" aria-label="Scripts on the site">
          <h2 className="text-base font-semibold">Scripts on the site</h2>
          {scripts.length === 0 ? <Empty>No scripts yet.</Empty> : null}
          {scripts.map((s) => (
            <details key={s.id} className="group rounded-xl bg-card shadow-[0_0_0_1px_rgba(17,24,39,0.1)]" data-testid={`script-${s.id}`}>
              <summary className="flex cursor-pointer items-center gap-3 p-4 text-sm">
                <span className="grid min-w-0 flex-1 gap-1.5">
                  <span className="truncate font-medium">{s.name}</span>
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge tone={KIND_TONE[s.kind]}>{KIND_LABEL[s.kind]}</Badge>
                    <span className="text-xs text-muted-foreground">{PLACE_LABEL[s.placement]}</span>
                  </span>
                </span>
                <ScriptSwitch id={s.id} name={s.name} enabled={s.enabled} />
              </summary>
              <div className="grid gap-3 border-t p-4">
                <ScriptForm isNew={false} compact values={s} />
                <form action={deleteScriptAction}><input type="hidden" name="id" value={s.id} /><button type="submit" className="text-sm text-destructive hover:underline">Delete this script</button></form>
              </div>
            </details>
          ))}
        </section>
      </div>
    </div>
  );
}
