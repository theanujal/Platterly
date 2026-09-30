"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { updateTeamPrivacyAction } from "../actions";
import type { TeamPrivacySettings } from "../types";
import { TeamNote } from "./team-note";

const SHARE_TOGGLES: { key: "showName" | "showEmail" | "showAvatar"; label: string; description: string }[] = [
  { key: "showName", label: "Show Name", description: "Display first and last name" },
  { key: "showEmail", label: "Show Email", description: "Display email address" },
  { key: "showAvatar", label: "Show Avatar", description: "Display profile picture" },
];

/**
 * Privacy tab. Each switch saves the moment it's flipped (no Save button), and
 * rolls back if the save fails. Only someone who can edit Settings (the Owner)
 * can change these; everyone else sees them read-only. The settings are
 * team-wide, and are applied to what non-owners see on the Team Members tab.
 */
export function TeamPrivacyForm({ initialValues, canEdit }: { initialValues: TeamPrivacySettings; canEdit: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState(initialValues);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(key: keyof TeamPrivacySettings, checked: boolean) {
    const previous = values;
    const next = { ...values, [key]: checked };
    setValues(next);
    setError(null);
    setPending(true);
    const formData = new FormData();
    for (const [k, v] of Object.entries(next)) formData.set(k, String(v));
    const result = await updateTeamPrivacyAction(formData);
    setPending(false);
    if (!result.ok) {
      setValues(previous);
      setError(result.error);
      return;
    }
    router.refresh();
  }

  const disabled = !canEdit || pending;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <ShieldCheck className="size-5" />
          Team Privacy Settings
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Control what information you share with your team members. These settings apply to everyone on the team.
        </p>
      </div>

      <div className="flex items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <label htmlFor="allowTeamVisibility" className="text-sm font-medium">
            Allow Team Visibility
          </label>
          <p className="text-xs text-muted-foreground">Allow team members to see each other&apos;s profile information</p>
        </div>
        <Switch
          id="allowTeamVisibility"
          checked={values.allowTeamVisibility}
          disabled={disabled}
          onCheckedChange={(checked) => change("allowTeamVisibility", checked)}
        />
      </div>

      <div className="flex flex-col gap-4">
        <h3 className="text-sm font-medium">What to share with team members:</h3>
        {SHARE_TOGGLES.map(({ key, label, description }) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <div>
              <label htmlFor={key} className="text-sm font-medium">
                {label}
              </label>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
            <Switch
              id={key}
              checked={values[key]}
              disabled={disabled || !values.allowTeamVisibility}
              onCheckedChange={(checked) => change(key, checked)}
            />
          </div>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!canEdit && <p className="text-sm text-muted-foreground">Only an Owner can change these settings.</p>}

      <TeamNote>
        These settings apply to the whole team and only control what team members see of each other. Owners always see everyone in
        full.
      </TeamNote>
    </div>
  );
}
