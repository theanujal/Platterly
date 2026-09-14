"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUS_OPTIONS = [
  { value: "ALL", label: "All Statuses" },
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "QUOTATION_SENT", label: "Quotation Sent" },
  { value: "FOLLOW_UP", label: "Follow-up" },
  { value: "CONVERTED", label: "Converted" },
  { value: "LOST", label: "Lost" },
] as const;

export function EnquiryStatusFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateStatus(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "ALL") params.delete("status");
    else params.set("status", value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Select value={searchParams.get("status") ?? "ALL"} onValueChange={(v) => updateStatus(v ?? "ALL")}>
      <SelectTrigger aria-label="Status filter" className="w-44">
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
