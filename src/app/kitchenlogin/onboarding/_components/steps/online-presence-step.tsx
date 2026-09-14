import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WizardState } from "../types";

interface OnlinePresenceStepProps {
  values: WizardState;
  setField: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
}

export function OnlinePresenceStep({ values, setField }: OnlinePresenceStepProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="websiteUrl">Website URL</Label>
        <Input
          id="websiteUrl"
          type="url"
          value={values.websiteUrl}
          onChange={(e) => setField("websiteUrl", e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="instagramUrl">Instagram URL</Label>
        <Input
          id="instagramUrl"
          type="url"
          value={values.instagramUrl}
          onChange={(e) => setField("instagramUrl", e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="facebookUrl">Facebook URL</Label>
        <Input
          id="facebookUrl"
          type="url"
          value={values.facebookUrl}
          onChange={(e) => setField("facebookUrl", e.target.value)}
        />
      </div>
    </div>
  );
}
