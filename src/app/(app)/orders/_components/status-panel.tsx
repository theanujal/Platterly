"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, History, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ORDER_STATUS_LABEL, MENU_SELECTION_STATUS_LABEL, type Tone } from "@/modules/orders/order-status";
import { SummaryCard } from "./order-form-parts";
import type { LucideIcon } from "lucide-react";

export interface StatusHistoryEntry {
  id: string;
  subject: "ORDER" | "MENU_APPROVAL";
  fromStatus: string | null;
  toStatus: string;
  source: "AUTOMATIC" | "MANUAL";
  trigger: string | null;
  reason: string | null;
  actorName: string | null;
  createdAt: Date;
}

type Result = { ok: true } | { ok: false; error: string };

/** The reason a hand-made change needs is at least this long, the same as the server's rule. */
const MIN_REASON = 5;

function labelFor(entry: StatusHistoryEntry, status: string | null) {
  if (!status) return "—";
  const map = (entry.subject === "ORDER" ? ORDER_STATUS_LABEL : MENU_SELECTION_STATUS_LABEL) as Record<string, string>;
  return map[status] ?? status;
}

function formatWhen(date: Date) {
  return new Date(date).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function HistoryItem({ entry }: { entry: StatusHistoryEntry }) {
  const manual = entry.source === "MANUAL";
  return (
    <li className="flex flex-col gap-1 rounded-lg bg-muted p-3 text-sm" data-testid="status-history-entry">
      <div className="flex flex-wrap items-center gap-1.5 font-medium">
        <span>{labelFor(entry, entry.fromStatus)}</span>
        <ArrowRight className="size-3.5 text-muted-foreground" />
        <span>{labelFor(entry, entry.toStatus)}</span>
        <Badge variant={manual ? "warning" : "neutral"} className="ml-auto">
          {manual ? "Manual" : "Automatic"}
        </Badge>
      </div>
      {entry.reason && <p className="whitespace-pre-wrap text-foreground">“{entry.reason}”</p>}
      <p className="text-xs text-muted-foreground">
        {[manual ? (entry.actorName ?? "Someone") : entry.trigger, manual ? entry.trigger : entry.actorName, formatWhen(entry.createdAt)]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </li>
  );
}

/**
 * The status card shared by the Order sidebar and the Menu Approvals page (AJ, 2026-09-30): the current status and what it
 * means, a "Change status" select that asks for a reason, and the recorded history. Anyone may see the history; `canChange` gates the select.
 */
export function StatusPanel({
  title,
  icon,
  currentLabel,
  currentTone,
  hint,
  extra,
  options,
  currentValue,
  canChange,
  onChange,
  history,
  idPrefix,
}: {
  title: string;
  icon: LucideIcon;
  currentLabel: string;
  currentTone: Tone;
  hint?: string;
  /** Small text after the badge, e.g. "Version 2". */
  extra?: string;
  options: { value: string; label: string }[];
  currentValue: string;
  canChange: boolean;
  onChange: (value: string, reason: string) => Promise<Result>;
  history: StatusHistoryEntry[];
  idPrefix: string;
}) {
  const router = useRouter();
  const [pendingValue, setPendingValue] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const targetLabel = options.find((o) => o.value === pendingValue)?.label ?? "";

  async function confirm() {
    if (!pendingValue) return;
    if (reason.trim().length < MIN_REASON) {
      setError("Write a reason for the change (at least a few words).");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await onChange(pendingValue, reason);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPendingValue(null);
    setReason("");
    router.refresh();
  }

  function close() {
    setPendingValue(null);
    setReason("");
    setError(null);
  }

  return (
    <SummaryCard icon={icon} title={title}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={currentTone}>{currentLabel}</Badge>
        {extra && <span className="text-sm text-muted-foreground">{extra}</span>}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}

      {canChange && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-change`} className="text-xs">
            Change status manually
          </Label>
          <Select
            items={Object.fromEntries(options.map((o) => [o.value, o.label]))}
            value={currentValue}
            onValueChange={(value) => {
              if (value && value !== currentValue) setPendingValue(value);
            }}
          >
            <SelectTrigger id={`${idPrefix}-change`} className="w-full" aria-label="Change status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <History className="size-4 text-muted-foreground" />
            Status History
          </span>
          {history.length > 3 && (
            <Button type="button" variant="link" size="sm" className="px-0 text-info" onClick={() => setHistoryOpen(true)}>
              View all
            </Button>
          )}
        </div>
        {history.length === 0 ? (
          <p className="text-xs text-muted-foreground">No changes recorded yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {history.slice(0, 3).map((entry) => (
              <HistoryItem key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </div>

      <Dialog open={pendingValue !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change status to {targetLabel}?</DialogTitle>
            <DialogDescription>Say why you are changing it by hand. The reason is saved in the status history for the whole team.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${idPrefix}-reason`} required>
              Reason
            </Label>
            <Textarea
              id={`${idPrefix}-reason`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Confirmed everything with the customer over a call"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="button" disabled={saving} onClick={confirm}>
              <Pencil data-icon="inline-start" />
              {saving ? "Saving…" : "Change status"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Status history</DialogTitle>
            <DialogDescription>Every automatic and manual status change, newest first.</DialogDescription>
          </DialogHeader>
          <ul className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
            {history.map((entry) => (
              <HistoryItem key={entry.id} entry={entry} />
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </SummaryCard>
  );
}
