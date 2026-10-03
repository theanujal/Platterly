"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface AuditRowView {
  id: string;
  when: string;
  who: string;
  summary: string;
  action: string;
  recordType: string;
  recordId: string;
  href: string | null;
  changes: { field: string; before: string; after: string }[];
}

const humanType = (type: string) => type.replace(/([A-Z])/g, " $1").trim();

/** The log, newest first. A row with recorded changes opens to show each field's before and after. */
export function AuditTable({ rows }: { rows: AuditRowView[] }) {
  const [open, setOpen] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border p-10 text-center text-sm text-muted-foreground" data-testid="audit-empty">
        No entries match these filters.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10" data-testid="audit-table">
      <Table>
        <TableHeader className="bg-muted">
          <TableRow>
            <TableHead className="h-12 px-3 text-xs font-bold tracking-wider uppercase">When</TableHead>
            <TableHead className="h-12 px-3 text-xs font-bold tracking-wider uppercase">Who</TableHead>
            <TableHead className="h-12 px-3 text-xs font-bold tracking-wider uppercase">What happened</TableHead>
            <TableHead className="h-12 px-3 text-xs font-bold tracking-wider uppercase">Record</TableHead>
            <TableHead className="h-12 w-10 px-3">
              <span className="sr-only">Details</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const expanded = open === row.id;
            const canOpen = row.changes.length > 0;
            return (
              <Fragment key={row.id}>
                <TableRow data-testid="audit-row" className={canOpen ? "cursor-pointer" : undefined} onClick={canOpen ? () => setOpen(expanded ? null : row.id) : undefined}>
                  <TableCell className="px-3 py-3 whitespace-nowrap text-muted-foreground">{row.when}</TableCell>
                  <TableCell className="px-3 py-3 whitespace-nowrap font-medium">{row.who}</TableCell>
                  <TableCell className="px-3 py-3">
                    <span className="block font-medium">{row.summary}</span>
                    <span className="block font-mono text-xs text-muted-foreground">{row.action}</span>
                  </TableCell>
                  <TableCell className="px-3 py-3 whitespace-nowrap">
                    <span className="block">{humanType(row.recordType)}</span>
                    {row.href ? (
                      <Link href={row.href} className="font-mono text-xs text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                        {row.recordId.slice(-8)}
                      </Link>
                    ) : (
                      <span className="font-mono text-xs text-muted-foreground">{row.recordId.slice(-8)}</span>
                    )}
                  </TableCell>
                  <TableCell className="px-3 py-3 text-muted-foreground">
                    {canOpen && (
                      <button type="button" aria-label={expanded ? "Hide details" : "Show details"} aria-expanded={expanded} onClick={(e) => { e.stopPropagation(); setOpen(expanded ? null : row.id); }}>
                        {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      </button>
                    )}
                  </TableCell>
                </TableRow>
                {expanded && (
                  <TableRow data-testid="audit-details" className="bg-muted/50 hover:bg-muted/50">
                    <TableCell colSpan={5} className="px-3 py-3">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs font-bold tracking-wider text-muted-foreground uppercase">
                            <th className="py-1 pr-4 font-bold">Field</th>
                            <th className="py-1 pr-4 font-bold">Before</th>
                            <th className="py-1 font-bold">After</th>
                          </tr>
                        </thead>
                        <tbody>
                          {row.changes.map((c) => (
                            <tr key={c.field} className="border-t border-border align-top">
                              <td className="py-1.5 pr-4 font-medium">{c.field}</td>
                              <td className="py-1.5 pr-4 break-words text-muted-foreground">{c.before}</td>
                              <td className="py-1.5 break-words">{c.after}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
