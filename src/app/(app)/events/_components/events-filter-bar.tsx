"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { RotateCw, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUS_OPTIONS = [
  { value: "ALL", label: "All Status" },
  { value: "PENDING", label: "Pending" },
  { value: "PROCESSING", label: "Processing" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

interface EventsFilterBarProps {
  kitchens: { id: string; name: string }[];
}

export function EventsFilterBar({ kitchens }: EventsFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "" || value === "ALL") params.delete(key);
    else params.set(key, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        className="relative max-w-sm flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          updateParam("search", search);
        }}
      >
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search events…"
          className="pl-8"
          aria-label="Search events"
        />
      </form>

      <Select value={searchParams.get("status") ?? "ALL"} onValueChange={(v) => updateParam("status", v ?? "ALL")}>
        <SelectTrigger aria-label="Status filter" className="w-40">
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

      <Select value={searchParams.get("kitchenId") ?? "ALL"} onValueChange={(v) => updateParam("kitchenId", v ?? "ALL")}>
        <SelectTrigger aria-label="Location filter" className="w-44">
          <SelectValue placeholder="All Locations" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All Locations</SelectItem>
          {kitchens.map((k) => (
            <SelectItem key={k.id} value={k.id}>
              {k.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button type="button" variant="outline" size="sm" onClick={() => router.refresh()}>
        <RotateCw className="size-4" />
        Refresh
      </Button>
    </div>
  );
}
