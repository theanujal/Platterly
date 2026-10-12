"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TIME_ZONE_OPTIONS } from "@/lib/time/timezone";
import { useStopEditing } from "../../../../_components/editable-panel";
import { FormFooter } from "../../../../_components/settings-ui";
import { updateTimeZoneAction } from "../actions";

export function TimeZoneForm({ initialValue }: { initialValue: string }) {
  const router = useRouter();
  const stopEditing = useStopEditing();
  const [timeZone, setTimeZone] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const formData = new FormData();
    formData.set("timeZone", timeZone);
    const result = await updateTimeZoneAction(formData);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
    stopEditing();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="timeZone">Time Zone</Label>
        <Select items={Object.fromEntries(TIME_ZONE_OPTIONS.map((o) => [o.value, o.label]))} value={timeZone} onValueChange={(value) => setTimeZone(value as string)}>
          <SelectTrigger id="timeZone" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIME_ZONE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <FormFooter error={error}>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save Changes"}
        </Button>
        <Button type="button" variant="outline" onClick={stopEditing}>
          Cancel
        </Button>
      </FormFooter>
    </form>
  );
}
