import { Globe } from "lucide-react";
import { FacebookIcon, InstagramIcon } from "@/components/ui/brand-icons";
import { Label } from "@/components/ui/label";
import { IconInput } from "../../../_components/icon-input";
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
        <IconInput
          icon={Globe}
          id="websiteUrl"
          placeholder="https://yourwebsite.com"
          type="url"
          value={values.websiteUrl}
          onChange={(e) => setField("websiteUrl", e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="instagramUrl">Instagram URL</Label>
        <IconInput
          icon={InstagramIcon}
          id="instagramUrl"
          placeholder="https://instagram.com/yourkitchen"
          type="url"
          value={values.instagramUrl}
          onChange={(e) => setField("instagramUrl", e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="facebookUrl">Facebook URL</Label>
        <IconInput
          icon={FacebookIcon}
          id="facebookUrl"
          placeholder="https://facebook.com/yourkitchen"
          type="url"
          value={values.facebookUrl}
          onChange={(e) => setField("facebookUrl", e.target.value)}
        />
      </div>
    </div>
  );
}
