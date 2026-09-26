"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ORDER_STATUS_LABEL, ORDER_STATUS_ORDER } from "@/modules/orders/order-status";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUS_OPTIONS = [
  { value: "ALL", label: "All Status" },
  ...ORDER_STATUS_ORDER.map((value) => ({ value, label: ORDER_STATUS_LABEL[value] })),
];

const ORDER_KIND_OPTIONS = [
  { value: "ALL", label: "All Types" },
  { value: "SINGLE", label: "Single Order" },
  { value: "MULTI", label: "Multi Order" },
] as const;

export function OrdersFilterBar({ eventTypes }: { eventTypes: { id: string; name: string }[] }) {
  const eventTypeOptions = [{ value: "ALL", label: "All Event Types" }, ...eventTypes.map((t) => ({ value: t.id, label: t.name }))];

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "" || value === "ALL") params.delete(key);
    else params.set(key, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <>
      <Select
        items={Object.fromEntries(STATUS_OPTIONS.map((o) => [o.value, o.label]))}
        value={searchParams.get("status") ?? "ALL"}
        onValueChange={(v) => updateParam("status", v ?? "ALL")}
      >
        <SelectTrigger aria-label="Order status filter" className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        items={Object.fromEntries(eventTypeOptions.map((o) => [o.value, o.label]))}
        value={searchParams.get("eventType") ?? "ALL"}
        onValueChange={(v) => updateParam("eventType", v ?? "ALL")}
      >
        <SelectTrigger aria-label="Event type filter" className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {eventTypeOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        items={Object.fromEntries(ORDER_KIND_OPTIONS.map((o) => [o.value, o.label]))}
        value={searchParams.get("orderKind") ?? "ALL"}
        onValueChange={(v) => updateParam("orderKind", v ?? "ALL")}
      >
        <SelectTrigger aria-label="Order type filter" className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ORDER_KIND_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
