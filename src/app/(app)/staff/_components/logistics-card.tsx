"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DISPATCH_STATUSES, DISPATCH_STATUS_LABEL, DISPATCH_STATUS_TONE, SETUP_STATUSES, SETUP_STATUS_LABEL } from "@/modules/logistics/labels";
import type { DispatchStatus } from "@/generated/prisma/enums";
import { saveLogisticsAction, type LogisticsForm } from "../event-ops-actions";

export interface LogisticsData {
  form: LogisticsForm;
  /** Real moments (ISO), stamped when the dispatch status moved. */
  dispatchedAt: string | null;
  deliveredAt: string | null;
  address: { venue: string | null; address: string | null; contact: string | null; instructions: string | null } | null;
}

const stamp = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

/** Vehicle, driver, dispatch and setup for the event. The address shown is the order's own venue details. */
export function LogisticsCard({ orderId, eventId, data, canEdit }: { orderId: string | null; eventId: string; data: LogisticsData; canEdit: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState(data.form);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const set = <K extends keyof LogisticsForm>(key: K, value: LogisticsForm[K]) => {
    setSaved(false);
    setForm((f) => ({ ...f, [key]: value }));
  };

  async function save() {
    setPending(true);
    setError(null);
    const result = await saveLogisticsAction(orderId, eventId, form);
    setPending(false);
    if (!result.ok) return setError(result.error);
    setSaved(true);
    router.refresh();
  }

  const field = (id: string, label: string, key: keyof LogisticsForm, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} disabled={!canEdit} value={form[key]} onChange={(e) => set(key, e.target.value)} {...props} />
    </div>
  );

  return (
    <Card data-testid="logistics-card" onKeyDown={(e) => e.key === "Enter" && e.target instanceof HTMLInputElement && e.preventDefault()}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Logistics
          <Badge variant={DISPATCH_STATUS_TONE[form.dispatchStatus as DispatchStatus] ?? "neutral"}>{DISPATCH_STATUS_LABEL[form.dispatchStatus as DispatchStatus] ?? form.dispatchStatus}</Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">Vehicle, driver, dispatch and setup for this event.</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {data.address && (
          <div className="rounded-lg bg-muted p-3 text-sm" data-testid="delivery-address">
            <p className="font-medium">Delivery address (from the order)</p>
            <p>{[data.address.venue, data.address.address].filter(Boolean).join(", ") || "No venue details on the order yet."}</p>
            {data.address.contact && <p className="text-muted-foreground">Contact: {data.address.contact}</p>}
            {data.address.instructions && <p className="text-muted-foreground">{data.address.instructions}</p>}
          </div>
        )}

        {/* A div, not a form: this card also sits inside the order page's own form. */}
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {field("lg-vehicle-type", "Vehicle type", "vehicleType", { placeholder: "Tempo, van…" })}
            {field("lg-vehicle-number", "Vehicle number", "vehicleNumber")}
            {field("lg-driver", "Driver", "driverName")}
            {field("lg-driver-phone", "Driver phone", "driverPhone", { type: "tel" })}
            {field("lg-planned", "Leaves at", "dispatchPlannedAt", { type: "datetime-local" })}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lg-dispatch">Dispatch status</Label>
              <Select items={DISPATCH_STATUS_LABEL} value={form.dispatchStatus} disabled={!canEdit} onValueChange={(v) => set("dispatchStatus", v ?? form.dispatchStatus)}>
                <SelectTrigger id="lg-dispatch" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DISPATCH_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {DISPATCH_STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lg-setup">Setup status</Label>
              <Select items={SETUP_STATUS_LABEL} value={form.setupStatus} disabled={!canEdit} onValueChange={(v) => set("setupStatus", v ?? form.setupStatus)}>
                <SelectTrigger id="lg-setup" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SETUP_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {SETUP_STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {field("lg-setup-time", "Setup time", "setupTime", { type: "datetime-local" })}
          </div>

          {(data.dispatchedAt || data.deliveredAt) && (
            <p className="text-sm text-muted-foreground">
              {data.dispatchedAt && <>Left {stamp(data.dispatchedAt)}. </>}
              {data.deliveredAt && <>Delivered {stamp(data.deliveredAt)}.</>}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {canEdit && (
            <div className="flex items-center gap-3">
              <Button type="button" disabled={pending} onClick={() => void save()}>
                {pending ? "Saving…" : "Save logistics"}
              </Button>
              {saved && (
                <span role="status" className="text-sm text-muted-foreground">
                  Saved
                </span>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
