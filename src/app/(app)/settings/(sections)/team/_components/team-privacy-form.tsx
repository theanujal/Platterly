"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { updateTeamPrivacyAction } from "../actions";
import type { TeamPrivacySettings } from "../types";

const TOGGLES: { key: keyof TeamPrivacySettings; label: string }[] = [
  { key: "allowTeamVisibility", label: "Allow team visibility" },
  { key: "showName", label: "Show name" },
  { key: "showEmail", label: "Show email" },
  { key: "showAvatar", label: "Show avatar" },
];

// Chunk 5 Group 5.2 — these toggles only affect what teammates see about
// each other; they never restrict Owner/Admin's own visibility. No
// member-facing "team directory" exists yet for them to gate — this stores
// the preference for a later chunk to read.
export function TeamPrivacyForm({ initialValues }: { initialValues: TeamPrivacySettings }) {
  const router = useRouter();
  const [values, setValues] = useState(initialValues);
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSuccess(false);
    setPending(true);
    const formData = new FormData();
    for (const { key } of TOGGLES) {
      formData.set(key, String(values[key]));
    }
    await updateTeamPrivacyAction(formData);
    setPending(false);
    setSuccess(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {TOGGLES.map(({ key, label }) => (
        <div key={key} className="flex items-center gap-2">
          <Checkbox
            id={key}
            checked={values[key]}
            onCheckedChange={(checked) => setValues((prev) => ({ ...prev, [key]: checked === true }))}
          />
          <Label htmlFor={key}>{label}</Label>
        </div>
      ))}
      {success && <p className="text-sm text-emerald-600">Saved.</p>}
      <Button type="submit" disabled={pending} size="sm" className="self-start">
        {pending ? "Saving…" : "Save privacy settings"}
      </Button>
    </form>
  );
}
