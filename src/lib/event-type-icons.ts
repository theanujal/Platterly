import {
  Heart,
  PartyPopper,
  Cake,
  Users,
  Briefcase,
  GraduationCap,
  Gift,
  Music,
  Utensils,
  Star,
  type LucideIcon,
} from "lucide-react";

/**
 * Chunk 9 Group 9.1 — a small curated set rather than a full icon-picker
 * library; matches Updated doc §7's "Icon" field without pulling in new
 * dependencies for something this simple.
 */
export const EVENT_TYPE_ICONS: Record<string, LucideIcon> = {
  wedding: Heart,
  party: PartyPopper,
  birthday: Cake,
  corporate: Briefcase,
  social: Users,
  graduation: GraduationCap,
  celebration: Gift,
  festival: Music,
  catering: Utensils,
  other: Star,
};

export const EVENT_TYPE_ICON_OPTIONS = [
  { value: "wedding", label: "Wedding" },
  { value: "party", label: "Party" },
  { value: "birthday", label: "Birthday" },
  { value: "corporate", label: "Corporate" },
  { value: "social", label: "Social Gathering" },
  { value: "graduation", label: "Graduation" },
  { value: "celebration", label: "Celebration" },
  { value: "festival", label: "Festival" },
  { value: "catering", label: "Catering" },
  { value: "other", label: "Other" },
] as const;

export function getEventTypeIcon(icon: string | null | undefined): LucideIcon {
  return (icon && EVENT_TYPE_ICONS[icon]) || Star;
}
