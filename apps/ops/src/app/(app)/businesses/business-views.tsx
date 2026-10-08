import Link from "next/link";
import { ChevronRight, Mail } from "lucide-react";
import { Badge, formatWhen } from "@/components/ui";
import { CardMenu } from "./card-menu";

type Tone = "neutral" | "info" | "warning" | "success" | "danger";

export interface BusinessRowData {
  id: string;
  name: string;
  ownerName: string | null;
  ownerEmail: string | null;
  status: "ACTIVE" | "SUSPENDED" | "PENDING_DELETE";
  createdAt: Date;
  products: { productKey: string; lastActiveAt: Date | null; usage: unknown; product: { name: string } }[];
  subscriptions: { productKey: string; status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "LOCKED" | "CANCELLED"; trialEndsAt: Date | null; currentPeriodEnd: Date | null; plan: { name: string; isTrial: boolean } }[];
}

const STATUS: Record<BusinessRowData["status"], [Tone, string]> = { ACTIVE: ["success", "Active"], SUSPENDED: ["warning", "Suspended"], PENDING_DELETE: ["danger", "Pending delete"] };

const DAY = 86_400_000;
const daysLeft = (d: Date | null, now: number) => (d ? Math.ceil((d.getTime() - now) / DAY) : null);

/** One badge per product subscription: trial with days left, plan name, locked, or no plan. */
export function planBadges(b: BusinessRowData, now = Date.now()): { key: string; tone: Tone; text: string }[] {
  if (b.products.length === 0) return [];
  return b.products.map((bp) => {
    const sub = b.subscriptions.find((s) => s.productKey === bp.productKey);
    const prefix = b.products.length > 1 ? `${bp.product.name}: ` : "";
    if (!sub) return { key: bp.productKey, tone: "neutral" as const, text: `${prefix}No plan` };
    if (sub.status === "TRIALING") { const d = daysLeft(sub.trialEndsAt, now); return { key: bp.productKey, tone: "info" as const, text: `${prefix}Trial${d === null ? "" : d > 0 ? ` · ${d}d left` : " · ending"}` }; }
    if (sub.status === "LOCKED") return { key: bp.productKey, tone: "danger" as const, text: `${prefix}Locked` };
    if (sub.status === "PAST_DUE") return { key: bp.productKey, tone: "warning" as const, text: `${prefix}${sub.plan.name} · past due` };
    return { key: bp.productKey, tone: "success" as const, text: `${prefix}${sub.plan.name}` };
  });
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
const usageOf = (b: BusinessRowData) => b.products.reduce((sum, bp) => sum + Object.values(((bp.usage as { counts?: Record<string, number> } | null)?.counts) ?? {}).reduce((a, c) => a + c, 0), 0);

export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  return <span style={{ width: size, height: size }} className="flex shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary" aria-hidden>{initials(name)}</span>;
}

/** The card view (design system: entity card, 14px radius, 3-dot menu, badges, stats). */
export function BusinessCard({ b }: { b: BusinessRowData }) {
  const [tone, label] = STATUS[b.status];
  const lastActive = b.products.map((p) => p.lastActiveAt).filter((d): d is Date => d !== null).sort((x, y) => y.getTime() - x.getTime())[0] ?? null;
  return (
    <section className="flex flex-col gap-4 rounded-[14px] bg-card p-5 shadow-[0_0_0_1px_rgba(17,24,39,0.1)]">
      <div className="flex items-start gap-3">
        <Avatar name={b.name} size={48} />
        <div className="min-w-0 flex-1">
          <Link href={`/businesses/${b.id}`} className="block truncate text-base font-semibold hover:underline">{b.name}</Link>
          <p className="truncate text-sm text-muted-foreground">{b.ownerName ?? "Owner unknown"}</p>
          {b.ownerEmail ? <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground"><Mail className="size-3" aria-hidden />{b.ownerEmail}</p> : null}
        </div>
        <CardMenu id={b.id} name={b.name} email={b.ownerEmail} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Badge tone={tone}>{label}</Badge>
        {planBadges(b).map((p) => <Badge key={p.key} tone={p.tone}>{p.text}</Badge>)}
      </div>
      <dl className="mt-auto grid grid-cols-3 gap-3 border-t border-border pt-4 text-sm">
        <div><dt className="text-xs text-muted-foreground">Products</dt><dd className="truncate font-semibold">{b.products.map((p) => p.product.name).join(", ") || "—"}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Activity</dt><dd className="font-semibold">{usageOf(b).toLocaleString("en-IN")}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Joined</dt><dd className="font-semibold">{new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Kolkata" }).format(b.createdAt)}</dd></div>
      </dl>
      {lastActive ? <p className="-mt-2 text-xs text-muted-foreground">Last active {formatWhen(lastActive)}</p> : null}
    </section>
  );
}

/** The list view: one row per business, same facts as the card. */
export function BusinessTable({ rows }: { rows: BusinessRowData[] }) {
  return (
    <div className="overflow-x-auto rounded-[14px] bg-card shadow-[0_0_0_1px_rgba(17,24,39,0.1)]">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="bg-muted">
          <tr>{["Business", "Owner", "Products", "Plan", "Status", "Activity", "Joined", ""].map((h) => <th key={h} className="h-12 px-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{h}</th>)}</tr>
        </thead>
        <tbody className="[&_td]:border-t [&_td]:px-3 [&_td]:py-3 [&_td]:align-middle">
          {rows.map((b) => {
            const [tone, label] = STATUS[b.status];
            return (
              <tr key={b.id}>
                <td><div className="flex items-center gap-3"><Avatar name={b.name} size={40} /><Link href={`/businesses/${b.id}`} className="font-semibold hover:underline">{b.name}</Link></div></td>
                <td>{b.ownerName ?? "—"}<div className="text-xs text-muted-foreground">{b.ownerEmail ?? ""}</div></td>
                <td>{b.products.map((p) => p.product.name).join(", ") || "—"}</td>
                <td><div className="flex flex-wrap gap-1.5">{planBadges(b).map((p) => <Badge key={p.key} tone={p.tone}>{p.text}</Badge>)}</div></td>
                <td><Badge tone={tone}>{label}</Badge></td>
                <td className="font-medium">{usageOf(b).toLocaleString("en-IN")}</td>
                <td className="whitespace-nowrap">{formatWhen(b.createdAt)}</td>
                <td className="text-right"><div className="flex items-center justify-end gap-1"><CardMenu id={b.id} name={b.name} email={b.ownerEmail} /><Link href={`/businesses/${b.id}`} aria-label={`Open ${b.name}`} className="text-muted-foreground"><ChevronRight className="size-5" aria-hidden /></Link></div></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
