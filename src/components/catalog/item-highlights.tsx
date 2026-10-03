import { ChefHat, CookingPot, Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface ItemHighlights {
  popular: boolean;
  chefsSpecial: boolean;
  liveCounter: boolean;
}

/**
 * The caterer's highlight tags on a dish: Popular (orange), Chef's Special (pink) and Live Counter (violet, the same
 * hue as a Live Counter add-on). Renders nothing when none is set. Used on the Food Items card and list and on the
 * customer's dish rows and details popup, so a tag reads the same everywhere.
 */
export function ItemHighlightBadges({ highlights, className }: { highlights: ItemHighlights; className?: string }) {
  if (!highlights.popular && !highlights.chefsSpecial && !highlights.liveCounter) return null;
  return (
    <span className={className ?? "flex flex-wrap gap-1.5"} data-testid="item-highlights">
      {highlights.popular && (
        <Badge variant="orange">
          <Flame data-icon="inline-start" />
          Popular
        </Badge>
      )}
      {highlights.chefsSpecial && (
        <Badge variant="pink">
          <ChefHat data-icon="inline-start" />
          Chef&apos;s Special
        </Badge>
      )}
      {highlights.liveCounter && (
        <Badge variant="violet">
          <CookingPot data-icon="inline-start" />
          Live Counter
        </Badge>
      )}
    </span>
  );
}
