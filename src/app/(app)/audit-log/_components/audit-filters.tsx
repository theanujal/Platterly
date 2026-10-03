"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconInput } from "@/components/ui/icon-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Values {
  q: string;
  type: string;
  who: string;
  from: string;
  to: string;
}

const humanType = (type: string) => type.replace(/([A-Z])/g, " $1").trim();

/** The filters live in the URL (?q= &type= &who= &from= &to=), so a filtered view can be shared and survives a refresh. */
export function AuditFilters({ initial, recordTypes, actors }: { initial: Values; recordTypes: string[]; actors: { id: string; name: string }[] }) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(initial);
  const set = (key: keyof Values) => (value: string | null) => setValues((prev) => ({ ...prev, [key]: value ?? "" }));

  const typeItems: Record<string, string> = { all: "All records", ...Object.fromEntries(recordTypes.map((t) => [t, humanType(t)])) };
  const whoItems: Record<string, string> = { all: "Everyone", ...Object.fromEntries(actors.map((a) => [a.id, a.name])), none: "System and customers" };

  function apply(next: Values) {
    const params = new URLSearchParams();
    if (next.q.trim()) params.set("q", next.q.trim());
    if (next.type) params.set("type", next.type);
    if (next.who) params.set("who", next.who);
    if (next.from) params.set("from", next.from);
    if (next.to) params.set("to", next.to);
    router.push(params.size > 0 ? `/audit-log?${params}` : "/audit-log");
  }

  const clear = () => {
    const empty = { q: "", type: "", who: "", from: "", to: "" };
    setValues(empty);
    apply(empty);
  };

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      data-testid="audit-filters"
      onSubmit={(e) => {
        e.preventDefault();
        apply(values);
      }}
    >
      <div className="flex min-w-56 flex-1 flex-col gap-1.5">
        <Label htmlFor="audit-search">Search</Label>
        <IconInput icon={Search} id="audit-search" placeholder="Action, record type, person or record id" value={values.q} onChange={(e) => setValues((p) => ({ ...p, q: e.target.value }))} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="audit-type">Record</Label>
        <Select items={typeItems} value={values.type || "all"} onValueChange={(v) => set("type")(v === "all" ? "" : v)}>
          <SelectTrigger id="audit-type" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(typeItems).map(([key, text]) => (
              <SelectItem key={key} value={key}>
                {text}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="audit-who">Who</Label>
        <Select items={whoItems} value={values.who || "all"} onValueChange={(v) => set("who")(v === "all" ? "" : v)}>
          <SelectTrigger id="audit-who" className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(whoItems).map(([key, text]) => (
              <SelectItem key={key} value={key}>
                {text}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="audit-from">From</Label>
        <IconInput icon={CalendarDays} id="audit-from" type="date" className="w-44" value={values.from} onChange={(e) => setValues((p) => ({ ...p, from: e.target.value }))} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="audit-to">To</Label>
        <IconInput icon={CalendarDays} id="audit-to" type="date" className="w-44" value={values.to} onChange={(e) => setValues((p) => ({ ...p, to: e.target.value }))} />
      </div>
      <Button type="submit" variant="outline" size="md">
        Apply
      </Button>
      <Button type="button" variant="ghost" size="md" onClick={clear}>
        Clear
      </Button>
    </form>
  );
}
