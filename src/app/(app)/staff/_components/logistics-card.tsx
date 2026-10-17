"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Copy, Lock, MapPin, Truck } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DISPATCH_STATUSES, DISPATCH_STATUS_LABEL, DISPATCH_STATUS_TONE, SETUP_STATUSES, SETUP_STATUS_LABEL } from "@/modules/logistics/labels";
import type { DispatchStatus } from "@/generated/prisma/enums";
import { cn } from "cn";
import { SummaryCard } from "../../orders/_components/order-form-parts";
import { DateTile } from "../../orders/_components/event-venues-editor";
import { saveLogisticsAction, type LogisticsForm } from "../event-ops-actions";

/** The vehicle types offered; a type typed in earlier (free text) is kept and shown too. */
const VEHICLE_TYPES = ["Tempo", "Van", "Mini truck", "Truck", "Car", "Other"];

const EMPTY_FORM: LogisticsForm = { vehicleType: "", vehicleNumber: "", driverName: "", driverPhone: "", dispatchPlannedAt: "", dispatchStatus: "NOT_DISPATCHED", setupStatus: "NOT_STARTED", setupTime: "" };

export interface LogisticsEntry {
  form: LogisticsForm;
  /** Real moments (ISO), stamped when the dispatch status moved. */
  dispatchedAt: string | null;
  deliveredAt: string | null;
}

type Venue = { venue: string | null; address: string | null; contact: string | null; instructions: string | null };
export interface LogisticsAddress extends Venue {
  days: (Venue & { key: string; date: string; meal: string })[];
}

const stamp = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
const place = (v: Venue) => [v.venue, v.address].filter(Boolean).join(", ");

/**
 * Vehicle, driver, dispatch and setup. When the venue differs by event (`slots`, two or more) there is one record per event, each with its own
 * delivery address, in the same list-and-form design as the event venues on Order Details; when the venue is the same for all it is one record. It opens once
 * the order is sent to the kitchen (`state`). The address shown is the order's own venue details.
 */
export function LogisticsCard({
  orderId,
  eventId,
  entries,
  slots,
  address,
  canEdit,
  state,
}: {
  orderId: string | null;
  eventId: string;
  entries: Record<string, LogisticsEntry>;
  slots: { key: string; date: string; title: string }[];
  address: LogisticsAddress | null;
  canEdit: boolean;
  state: "open" | "notYet" | "completed";
}) {
  const router = useRouter();
  const perEvent = slots.length >= 2;
  const keys = perEvent ? slots.map((slot) => slot.key) : [""];
  const editable = canEdit && state === "open";
  // An event with no record of its own yet starts from the event's earlier record (an order that had one event), and an empty one otherwise.
  // When the venue is the same for all again, the one form starts from the first event's record, so nothing entered per event is lost from view.
  const startFor = (key: string): LogisticsEntry => entries[key] ?? { form: entries[""]?.form ?? (key === "" ? Object.values(entries)[0]?.form : undefined) ?? EMPTY_FORM, dispatchedAt: null, deliveredAt: null };
  const [forms, setForms] = useState<Record<string, LogisticsForm>>(() => Object.fromEntries(keys.map((key) => [key, startFor(key).form])));
  const [activeKey, setActiveKey] = useState(keys[0]);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const active = keys.includes(activeKey) ? activeKey : keys[0];
  const activeIndex = keys.indexOf(active);
  const form = forms[active] ?? startFor(active).form;
  const entry = startFor(active);
  const slot = slots.find((candidate) => candidate.key === active);
  const set = <K extends keyof LogisticsForm>(key: K, value: LogisticsForm[K]) => {
    setSavedKey(null);
    setForms((prev) => ({ ...prev, [active]: { ...(prev[active] ?? startFor(active).form), [key]: value } }));
  };
  const addressFor = (key: string): Venue | null => (address ? (address.days.find((day) => day.key === key) ?? address) : null);

  async function save() {
    setPending(true);
    setError(null);
    const result = await saveLogisticsAction(orderId, eventId, form, active);
    setPending(false);
    if (!result.ok) return setError(result.error);
    setSavedKey(active);
    router.refresh();
  }

  const field = (id: string, label: string, key: keyof LogisticsForm, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} disabled={!editable} value={form[key]} onChange={(e) => set(key, e.target.value)} {...props} />
    </div>
  );

  const vehicleOptions = VEHICLE_TYPES.includes(form.vehicleType) || !form.vehicleType ? VEHICLE_TYPES : [form.vehicleType, ...VEHICLE_TYPES];
  // Half-width sections (Vehicle | Driver) stack their fields; the full-width Schedule & Status runs two across.
  const section = (title: string, children: React.ReactNode, wide = false) => (
    <div className="flex flex-col gap-3 border-t border-border pt-5">
      <h3 className="text-base font-semibold">{title}</h3>
      <div className={wide ? "grid grid-cols-1 gap-4 @xl:grid-cols-2" : "grid grid-cols-1 gap-4"}>{children}</div>
    </div>
  );
  const status = (id: string, label: string, key: "dispatchStatus" | "setupStatus", labels: Record<string, string>, options: readonly string[]) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select items={labels} value={form[key]} disabled={!editable} onValueChange={(v) => set(key, v ?? form[key])}>
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
  const toneOf = (value: string) => DISPATCH_STATUS_TONE[value as DispatchStatus] ?? "neutral";
  const labelOf = (value: string) => DISPATCH_STATUS_LABEL[value as DispatchStatus] ?? value;

  const here = addressFor(active);
  const addressBlock = here && (
    <div className="rounded-lg bg-muted p-3 text-sm" data-testid="delivery-address">
      <p className="font-medium">Delivery address (from the order)</p>
      <p className="mt-1 flex items-start gap-2">
        <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span>{place(here) || "No venue details on the order yet."}</span>
      </p>
      {here.contact && <p className="text-muted-foreground">Contact: {here.contact}</p>}
      {here.instructions && <p className="text-muted-foreground">{here.instructions}</p>}
    </div>
  );

  return (
    <div data-testid="logistics-card" className="@container min-w-0" onKeyDown={(e) => e.key === "Enter" && e.target instanceof HTMLInputElement && e.preventDefault()}>
      <SummaryCard
        icon={Truck}
        title="Logistics"
        titleExtra={!perEvent ? <Badge variant={toneOf(form.dispatchStatus)}>{labelOf(form.dispatchStatus)}</Badge> : undefined}
        description={perEvent ? "Vehicle, driver, dispatch and setup details for each event." : "Vehicle, driver, dispatch and setup details for this event."}
      >
        {state !== "open" && (
          <div role="status" className="flex items-start gap-3 rounded-lg border border-info/30 bg-info/10 p-3 text-sm" data-testid="logistics-closed">
            <Lock className="mt-0.5 size-4 shrink-0 text-info" />
            <p>{state === "completed" ? "The order is completed, so logistics is read-only." : "Logistics opens once the order is sent to the kitchen."}</p>
          </div>
        )}

        {perEvent && (
          <div className="flex flex-col gap-3" data-testid="logistics-events">
            <p className="text-sm text-muted-foreground">{slots.length} events, each delivered and set up on its own.</p>
            <nav aria-label="Logistics events" className="flex gap-2 overflow-x-auto pb-1">
              {slots.map((item) => {
                const isActive = item.key === active;
                const there = addressFor(item.key);
                const dispatch = forms[item.key]?.dispatchStatus ?? startFor(item.key).form.dispatchStatus;
                return (
                  <button
                    key={item.key}
                    type="button"
                    aria-current={isActive}
                    onClick={() => setActiveKey(item.key)}
                    className={cn("flex min-w-64 max-w-80 flex-1 items-start gap-3 rounded-xl border bg-card p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50", isActive ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50")}
                  >
                    <DateTile date={item.date} active={isActive} />
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{item.title}</span>
                        <Badge variant={toneOf(dispatch)}>{labelOf(dispatch)}</Badge>
                      </span>
                      <span className={cn("mt-1 flex items-start gap-1.5 text-xs", there && place(there) ? "text-muted-foreground" : "text-warning")}>
                        <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        <span className="line-clamp-2">{there && place(there) ? place(there) : "Venue details pending"}</span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </nav>
            <div className="flex items-center gap-3" data-testid="logistics-event-header">
              {slot && <DateTile date={slot.date} active />}
              <h3 className="min-w-0 flex-1 text-lg font-semibold">{slot?.title}</h3>
              <div className="flex shrink-0 items-center gap-2">
                {editable && (
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button type="button" variant="outline" size="md" />}>
                      <Copy />
                      <span className="max-sm:sr-only">Copy vehicle & driver from another event</span>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {slots.map((item) =>
                        item.key === active ? null : (
                          <DropdownMenuItem
                            key={item.key}
                            onClick={() => {
                              const from = forms[item.key] ?? startFor(item.key).form;
                              setSavedKey(null);
                              setForms((prev) => ({ ...prev, [active]: { ...(prev[active] ?? startFor(active).form), vehicleType: from.vehicleType, vehicleNumber: from.vehicleNumber, driverName: from.driverName, driverPhone: from.driverPhone } }));
                            }}
                          >
                            {item.title}
                          </DropdownMenuItem>
                        ),
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <Button type="button" variant="outline" size="icon" aria-label="Previous event" disabled={activeIndex === 0} onClick={() => setActiveKey(keys[activeIndex - 1])}>
                  <ChevronLeft />
                </Button>
                <Button type="button" variant="outline" size="icon" aria-label="Next event" disabled={activeIndex === keys.length - 1} onClick={() => setActiveKey(keys[activeIndex + 1])}>
                  <ChevronRight />
                </Button>
              </div>
            </div>
          </div>
        )}

        {addressBlock}

        {/* Divs, not a form: this card also sits inside the order page's own form. */}
        <div className="grid grid-cols-1 gap-x-5 @xl:grid-cols-2">
        {section(
          "Vehicle Details",
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lg-vehicle-type">Vehicle type</Label>
              <Select items={Object.fromEntries(vehicleOptions.map((v) => [v, v]))} value={form.vehicleType} disabled={!editable} onValueChange={(v) => set("vehicleType", v ?? "")}>
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
        </div>
        {section(
          "Schedule & Status",
          <>
            {field("lg-planned", "Leaves at", "dispatchPlannedAt", { type: "datetime-local" })}
            {status("lg-dispatch", "Dispatch status", "dispatchStatus", DISPATCH_STATUS_LABEL, DISPATCH_STATUSES)}
            {status("lg-setup", "Setup status", "setupStatus", SETUP_STATUS_LABEL, SETUP_STATUSES)}
            {field("lg-setup-time", "Setup time", "setupTime", { type: "datetime-local" })}
          </>,
          true,
        )}

        {(entry.dispatchedAt || entry.deliveredAt) && (
          <p className="text-sm text-muted-foreground">
            {entry.dispatchedAt && <>Left {stamp(entry.dispatchedAt)}. </>}
            {entry.deliveredAt && <>Delivered {stamp(entry.deliveredAt)}.</>}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {editable && (
          <div className="flex items-center gap-3">
            <Button type="button" disabled={pending} onClick={() => void save()}>
              {pending ? "Saving…" : perEvent ? `Save ${slot?.title ?? "event"}` : "Save logistics"}
            </Button>
            {savedKey === active && (
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
