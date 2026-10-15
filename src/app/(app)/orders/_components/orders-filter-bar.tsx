"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { MENU_SELECTION_STATUS_LABEL, MENU_SELECTION_STATUS_ORDER, ORDER_STATUS_LABEL, ORDER_STATUS_ORDER } from "@/modules/orders/order-status";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUS_OPTIONS = [
  { value: "ALL", label: "All Status" },
  ...ORDER_STATUS_ORDER.map((value) => ({ value, label: ORDER_STATUS_LABEL[value] })),
];

const APPROVAL_OPTIONS = [
  { value: "ALL", label: "All Approvals" },
  { value: "NOT_STARTED", label: "Not Started" },
  ...MENU_SELECTION_STATUS_ORDER.map((value) => ({ value, label: MENU_SELECTION_STATUS_LABEL[value] })),
];

const VIEW_OPTIONS = [
  { value: "ALL", label: "All Orders" },
  { value: "past", label: "Past: Approval Pending" },
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
      {/* The default view lists every order; this view lists only past-event orders with approval work still outstanding. */}
      <Select items={Object.fromEntries(VIEW_OPTIONS.map((o) => [o.value, o.label]))} value={searchParams.get("view") === "past" ? "past" : "ALL"} onValueChange={(v) => updateParam("view", v ?? "ALL")}>
        <SelectTrigger aria-label="Orders view" className="w-52">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {VIEW_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

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

      <Select items={Object.fromEntries(APPROVAL_OPTIONS.map((o) => [o.value, o.label]))} value={searchParams.get("approval") ?? "ALL"} onValueChange={(v) => updateParam("approval", v ?? "ALL")}>
        <SelectTrigger aria-label="Menu approval filter" className="w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {APPROVAL_OPTIONS.map((option) => (
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
