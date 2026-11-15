import { parseFeatures } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { listMedia } from "@/modules/site-content/media";
import { LiveCardForm, UpcomingForm, type LibraryPicture } from "./card-forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Products" };

/** A date as the `datetime-local` field wants it, in India time (staff type launch times in India time). */
function indiaInput(date: Date | null): string {
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export default async function ProductsPage() {
  const [products, upcoming, media] = await Promise.all([
    prisma.product.findMany({ orderBy: { key: "asc" }, select: { key: true, name: true, status: true, tagline: true, cardImage: true, logo: true, about: true, features: true } }),
    prisma.upcomingProduct.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    listMedia(),
  ]);
  const library: LibraryPicture[] = media.map((m) => ({ name: m.name, label: m.originalName || m.name }));
  const now = new Date();

  return (
    <>
      <PageHeader title="Products" description="What each product's card says on every business's Account (My Products): the line, the picture and, for an upcoming product, its launch date." />

      <h2 className="mb-3 text-base font-semibold">Live products</h2>
      {products.length === 0 ? (
        <Empty>No live products yet.</Empty>
      ) : (
        <div className="mb-8 grid gap-4 lg:grid-cols-2">
          {products.map((p) => (
            <Card key={p.key} className="grid gap-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0"><h3 className="truncate text-base font-semibold">{p.name}</h3><p className="font-mono text-xs text-muted-foreground">{p.key}</p></div>
                {p.tagline ? <Badge tone="success">Shown on the Account</Badge> : <Badge tone="neutral">Not shown: no line yet</Badge>}
              </div>
              <LiveCardForm productKey={p.key} tagline={p.tagline ?? ""} cardImage={p.cardImage} logo={p.logo} about={p.about ?? ""} features={parseFeatures(p.features) ?? []} library={library} />
            </Card>
          ))}
        </div>
      )}

      <h2 className="mb-1 text-base font-semibold">Upcoming products</h2>
      <p className="mb-3 text-sm text-muted-foreground">Shown with &ldquo;Coming soon&rdquo; and a countdown to the launch date. When the date arrives staff are notified; turn the Upcoming switch off to make it live.</p>
      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        {upcoming.map((u) => {
          const due = u.upcoming && u.launchAt && u.launchAt <= now;
          return (
            <Card key={u.key} className="grid gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0"><h3 className="truncate text-base font-semibold">{u.name}</h3><p className="font-mono text-xs text-muted-foreground">{u.key}</p></div>
                <div className="flex flex-wrap gap-2">
                  {due ? <Badge tone="warning">Launch date reached: switch to live</Badge> : null}
                  <Badge tone={u.upcoming ? "info" : "success"}>{u.upcoming ? "Upcoming" : "Live"}</Badge>
                  <Badge tone={u.visible ? "success" : "neutral"}>{u.visible ? "Shown" : "Hidden"}</Badge>
                </div>
              </div>
              <UpcomingForm values={{ key: u.key, name: u.name, tagline: u.tagline ?? "", cardImage: u.cardImage, logo: u.logo, launchAt: indiaInput(u.launchAt), sortOrder: u.sortOrder, upcoming: u.upcoming, visible: u.visible }} library={library} />
            </Card>
          );
        })}
      </div>

      <Card className="mb-8 grid gap-4">
        <h3 className="text-base font-semibold">Add an upcoming product</h3>
        <UpcomingForm create values={{ key: "", name: "", tagline: "", cardImage: null, logo: null, launchAt: "", sortOrder: (upcoming.at(-1)?.sortOrder ?? 0) + 10, upcoming: true, visible: true }} library={library} />
      </Card>
    </>
  );
}
