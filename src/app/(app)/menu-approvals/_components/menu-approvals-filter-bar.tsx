"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUS_OPTIONS = [
  { value: "ALL", label: "All Status" },
  { value: "DRAFT", label: "Needs Review" },
  { value: "SENT_TO_CUSTOMER", label: "Awaiting Customer Approval" },
  { value: "CUSTOMER_REVIEWING", label: "Customer Reviewing" },
  { value: "CHANGES_REQUESTED", label: "Changes Requested" },
  { value: "KITCHEN_REVIEWING", label: "Needs Kitchen Review" },
  { value: "KITCHEN_CHANGES_REQUESTED", label: "Kitchen Changes Requested" },
  { value: "FINAL_LOCKED", label: "Approved & Sent to Kitchen" },
] as const;

export function MenuApprovalsFilterBar() {
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
    <Select
      items={Object.fromEntries(STATUS_OPTIONS.map((o) => [o.value, o.label]))}
      value={searchParams.get("status") ?? "ALL"}
      onValueChange={(v) => updateParam("status", v ?? "ALL")}
    >
      <SelectTrigger aria-label="Menu approval status filter" className="w-56">
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
  );
}
