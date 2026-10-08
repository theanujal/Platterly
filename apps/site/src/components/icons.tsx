import { BookOpen, CalendarDays, ChefHat, ClipboardList, Layers, Truck, TrendingUp, Users, Wallet, Check, ArrowRight, ChevronDown, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = { book: BookOpen, calendar: CalendarDays, chef: ChefHat, clipboard: ClipboardList, layers: Layers, truck: Truck, trending: TrendingUp, users: Users, wallet: Wallet };

/** Line icons (2px stroke) in navy or blue, picked by name from the content files. */
export function Icon({ name, className = "size-6" }: { name: string; className?: string }) {
  const Component = ICONS[name] ?? Layers;
  return <Component className={className} strokeWidth={1.75} aria-hidden />;
}

export { Check, ArrowRight, ChevronDown };
