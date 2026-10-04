"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { MapPin } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { setActiveLocationAction } from "@/app/(app)/actions";

const ALL = "ALL";

/** Chunk 23 — the owner's location switcher, top right. Every list that knows about locations follows it. */
export function LocationSwitcher({ locations, activeId }: { locations: { id: string; name: string }[]; activeId: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-1.5">
      <MapPin className="size-4 text-muted-foreground" aria-hidden />
      <Select
        items={{ [ALL]: "All locations", ...Object.fromEntries(locations.map((l) => [l.id, l.name])) }}
        value={activeId ?? ALL}
        disabled={pending}
        onValueChange={(value) =>
          startTransition(async () => {
            await setActiveLocationAction(value === ALL ? null : value);
            router.refresh();
          })
        }
      >
        <SelectTrigger aria-label="Location" className="w-40 sm:w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All locations</SelectItem>
          {locations.map((location) => (
            <SelectItem key={location.id} value={location.id}>
              {location.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
