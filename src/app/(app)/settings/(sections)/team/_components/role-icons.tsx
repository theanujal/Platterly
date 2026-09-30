import { Briefcase, ChefHat, Crown, Shield, User, Wallet, Warehouse, type LucideIcon } from "lucide-react";

const ROLE_ICONS: Record<string, LucideIcon> = {
  owner: Crown,
  manager: Shield,
  staff: User,
  kitchen: ChefHat,
  inventoryTeam: Warehouse,
  accounts: Wallet,
  salesEvents: Briefcase,
};

/** One icon per role, used by the invite form's dropdown and role card and by the member/invitation badges. */
export function RoleIcon({ role, className }: { role: string; className?: string }) {
  const Icon = ROLE_ICONS[role] ?? User;
  return <Icon className={className} />;
}
