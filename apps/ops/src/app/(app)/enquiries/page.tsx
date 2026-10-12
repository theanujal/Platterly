import Link from "next/link";
import { Mail, Phone } from "lucide-react";
import type { EnquiryStatus } from "@/generated/prisma/client";
import { Badge, Card, Empty, PageHeader, formatWhen } from "@/components/ui";
import { countNewEnquiries, listEnquiries, type EnquiryKind } from "@/modules/enquiries/enquiries";
import { LeadForm } from "./lead-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leads" };

const STATUSES: (EnquiryStatus | "ALL")[] = ["ALL", "NEW", "CONTACTED", "CLOSED"];
const LABEL: Record<EnquiryStatus | "ALL", string> = { ALL: "All", NEW: "New", CONTACTED: "Contacted", CLOSED: "Closed" };
const TONE: Record<EnquiryStatus, "warning" | "info" | "neutral"> = { NEW: "warning", CONTACTED: "info", CLOSED: "neutral" };

export default async function EnquiriesPage({ searchParams }: { searchParams: Promise<{ status?: string; kind?: string }> }) {
  const { status: statusParam, kind: kindParam } = await searchParams;
  const status = STATUSES.includes(statusParam as EnquiryStatus | "ALL") ? (statusParam as EnquiryStatus | "ALL") : "ALL";
  const kind: EnquiryKind | "ALL" = kindParam === "talk" || kindParam === "contact" ? kindParam : "ALL";
  const [rows, newCount] = await Promise.all([listEnquiries({ status, kind }), countNewEnquiries()]);
  const href = (s: string, k: string) => `/enquiries?${new URLSearchParams({ ...(s !== "ALL" ? { status: s } : {}), ...(k !== "ALL" ? { kind: k } : {}) }).toString()}`;

  return (
    <>
      <PageHeader title="Leads" description="People who asked for a demo or wrote to us from platterly.in. Follow up, then mark them Contacted or Closed." actions={<Badge tone={newCount > 0 ? "warning" : "success"}>{newCount} new</Badge>} />
      <div className="mb-4 flex flex-wrap items-center gap-2" role="tablist" aria-label="Status">
        {STATUSES.map((s) => (
          <Link key={s} href={href(s, kind)} role="tab" aria-selected={s === status} className={`inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium ${s === status ? "bg-primary text-primary-foreground" : "border border-border bg-white"}`}>
            {LABEL[s]}
          </Link>
        ))}
        <span className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          Form:
          {(["ALL", "talk", "contact"] as const).map((k) => (
            <Link key={k} href={href(status, k)} className={k === kind ? "font-semibold text-foreground" : "hover:underline"}>{k === "ALL" ? "All" : k === "talk" ? "Book a demo" : "Contact us"}</Link>
          ))}
        </span>
      </div>
      {rows.length === 0 ? (
        <Empty>No leads {status === "ALL" ? "yet" : "in this status"}.</Empty>
      ) : (
        <div className="grid gap-3">
          {rows.map((lead) => (
            <Card key={lead.id}>
              <div data-testid="lead" className="grid gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold">{lead.name}</span>
                    <Badge tone={TONE[lead.status]}>{LABEL[lead.status]}</Badge>
                    <Badge tone="neutral">{lead.kind === "talk" ? "Book a demo" : "Contact us"}</Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">{formatWhen(lead.createdAt)}{lead.page ? ` · ${lead.page}` : ""}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                  <a className="inline-flex items-center gap-1.5 hover:underline" href={`mailto:${lead.email}`}><Mail className="size-4 text-muted-foreground" aria-hidden />{lead.email}</a>
                  {lead.phone ? <a className="inline-flex items-center gap-1.5 hover:underline" href={`tel:${lead.phone}`}><Phone className="size-4 text-muted-foreground" aria-hidden />{lead.phone}</a> : null}
                  {lead.businessType ? <span className="text-muted-foreground">{lead.businessType}</span> : null}
                  {lead.subject ? <span className="text-muted-foreground">{lead.subject}</span> : null}
                </div>
                {lead.message ? <p className="whitespace-pre-line rounded-lg bg-muted px-3 py-2 text-sm">{lead.message}</p> : null}
                <LeadForm id={lead.id} status={lead.status} note={lead.note ?? ""} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
