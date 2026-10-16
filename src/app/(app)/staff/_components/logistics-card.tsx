"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Truck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DISPATCH_STATUSES, DISPATCH_STATUS_LABEL, DISPATCH_STATUS_TONE, SETUP_STATUSES, SETUP_STATUS_LABEL } from "@/modules/logistics/labels";
import type { DispatchStatus } from "@/generated/prisma/enums";
import { SummaryCard } from "../../orders/_components/order-form-parts";
import { saveLogisticsAction, type LogisticsForm } from "../event-ops-actions";

/** The vehicle types offered; a type typed in earlier (free text) is kept and shown too. */
const VEHICLE_TYPES = ["Tempo", "Van", "Mini truck", "Truck", "Car", "Other"];

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

  const vehicleOptions = VEHICLE_TYPES.includes(form.vehicleType) || !form.vehicleType ? VEHICLE_TYPES : [form.vehicleType, ...VEHICLE_TYPES];
  const section = (title: string, children: React.ReactNode) => (
    <div className="flex flex-col gap-3 border-t border-border pt-5">
      <h3 className="text-base font-semibold">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
  const status = (id: string, label: string, key: "dispatchStatus" | "setupStatus", labels: Record<string, string>, options: readonly string[]) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select items={labels} value={form[key]} disabled={!canEdit} onValueChange={(v) => set(key, v ?? form[key])}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((s) => (
            <SelectItem key={s} value={s}>
              {labels[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div data-testid="logistics-card" className="min-w-0" onKeyDown={(e) => e.key === "Enter" && e.target instanceof HTMLInputElement && e.preventDefault()}>
      <SummaryCard
        icon={Truck}
        title="Logistics"
        titleExtra={<Badge variant={DISPATCH_STATUS_TONE[form.dispatchStatus as DispatchStatus] ?? "neutral"}>{DISPATCH_STATUS_LABEL[form.dispatchStatus as DispatchStatus] ?? form.dispatchStatus}</Badge>}
        description="Vehicle, driver, dispatch and setup details for this event."
      >
        {data.address && (
          <div className="rounded-lg bg-muted p-3 text-sm" data-testid="delivery-address">
            <p className="font-medium">Delivery address (from the order)</p>
            <p className="mt-1 flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span>{[data.address.venue, data.address.address].filter(Boolean).join(", ") || "No venue details on the order yet."}</span>
            </p>
            {data.address.contact && <p className="text-muted-foreground">Contact: {data.address.contact}</p>}
            {data.address.instructions && <p className="text-muted-foreground">{data.address.instructions}</p>}
          </div>
        )}

        {/* Divs, not a form: this card also sits inside the order page's own form. */}
        {section(
          "Vehicle Details",
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lg-vehicle-type">Vehicle type</Label>
              <Select items={Object.fromEntries(vehicleOptions.map((v) => [v, v]))} value={form.vehicleType} disabled={!canEdit} onValueChange={(v) => set("vehicleType", v ?? "")}>
                <SelectTrigger id="lg-vehicle-type" className="w-full">
                  <SelectValue placeholder="Select vehicle type" />
                </SelectTrigger>
                <SelectContent>
                  {vehicleOptions.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {field("lg-vehicle-number", "Vehicle number", "vehicleNumber", { placeholder: "E.g. KA01AB1234" })}
          </>,
        )}
        {section(
          "Driver Details",
          <>
            {field("lg-driver", "Driver name", "driverName", { placeholder: "Enter driver name" })}
            {field("lg-driver-phone", "Driver phone", "driverPhone", { type: "tel", placeholder: "Enter phone number" })}
          </>,
        )}
        {section(
          "Schedule & Status",
          <>
            {field("lg-planned", "Leaves at", "dispatchPlannedAt", { type: "datetime-local" })}
            {status("lg-dispatch", "Dispatch status", "dispatchStatus", DISPATCH_STATUS_LABEL, DISPATCH_STATUSES)}
            {status("lg-setup", "Setup status", "setupStatus", SETUP_STATUS_LABEL, SETUP_STATUSES)}
            {field("lg-setup-time", "Setup time", "setupTime", { type: "datetime-local" })}
          </>,
        )}

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
      </SummaryCard>
    </div>
  );
}
