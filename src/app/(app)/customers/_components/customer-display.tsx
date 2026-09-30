import Link from "next/link";
import { Eye, Mail, Phone, ShoppingBag, CalendarDays } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell } from "@/components/ui/table";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { formatPhoneDisplay, whatsappDigits } from "@/lib/phone";

export interface CustomerDisplayData {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: "CUSTOMER" | "LEAD";
  isActive: boolean;
  orderCount: number;
  lastOrderAt: Date | null;
}

// Initials avatars take one of the existing accent tones, picked from the name
// so a customer keeps the same color everywhere (AJ's reference, 2026-09-30).
const AVATAR_TONES = [
  "bg-tone-orange/10 text-tone-orange",
  "bg-info/10 text-info",
  "bg-tone-pink/10 text-tone-pink",
  "bg-success/10 text-success",
  "bg-tone-violet/10 text-tone-violet",
  "bg-tone-cyan/10 text-tone-cyan",
  "bg-tone-yellow/10 text-tone-yellow",
  "bg-tone-teal/10 text-tone-teal",
] as const;

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0];
  return letters.toUpperCase();
}

function avatarTone(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

export function formatLastOrder(date: Date | null): string {
  if (!date) return "—";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function CustomerAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <div className={cn("flex size-12 shrink-0 items-center justify-center rounded-full text-base font-semibold", avatarTone(name), className)}>
      {initialsOf(name)}
    </div>
  );
}

export function CustomerStatusBadge({ status }: { status: CustomerDisplayData["status"] }) {
  return <Badge variant={status === "CUSTOMER" ? "info" : "warning"}>{status === "CUSTOMER" ? "Customer" : "Lead"}</Badge>;
}

/** Null until the caterer has claimed a real public link — the placeholder slug must never be sent to a customer. */
export function buildMenuMessageHref(customer: Pick<CustomerDisplayData, "name" | "phone">, organizationName: string, menuUrl: string | null): string | null {
  if (!menuUrl) return null;
  const message = `Hi ${customer.name}, this is ${organizationName}. Here's our menu — pick your dishes and plan your event: ${menuUrl}`;
  return `https://wa.me/${whatsappDigits(customer.phone)}?text=${encodeURIComponent(message)}`;
}

export function SendMenuButton({ href, className }: { href: string | null; className?: string }) {
  return (
    <Button
      size="md"
      className={cn("bg-[#25D366]/15 text-[#128C4A] hover:bg-[#25D366]/25", className)}
      disabled={!href}
      title={href ? undefined : "Claim your public menu link first (Settings → Integration)"}
      render={href ? <a href={href} target="_blank" rel="noreferrer" /> : undefined}
      nativeButton={!href}
    >
      <WhatsAppIcon className="size-4" />
      Send Menu on WhatsApp
    </Button>
  );
}

export function ViewCustomerButton({ id, name }: { id: string; name: string }) {
  return (
    <Button variant="outline" size="md" className="w-[38px] px-0" aria-label={`View ${name}`} render={<Link href={`/customers/${id}`} />} nativeButton={false}>
      <Eye className="size-4" />
    </Button>
  );
}

export function CustomerCard({ customer, menuHref, editAction }: { customer: CustomerDisplayData; menuHref: string | null; editAction: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex items-start gap-4">
        <CustomerAvatar name={customer.name} className="size-14" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-start justify-between gap-2">
            <Link href={`/customers/${customer.id}`} className="min-w-0 truncate text-base font-semibold hover:underline">
              {customer.name}
            </Link>
            <div className="-mt-1 -mr-2 flex shrink-0 items-center gap-1.5">
              <CustomerStatusBadge status={customer.status} />
              {!customer.isActive && <Badge variant="neutral">Inactive</Badge>}
              {editAction}
            </div>
          </div>
          <a href={`tel:${customer.phone}`} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <Phone className="size-4 shrink-0" />
            {formatPhoneDisplay(customer.phone)}
          </a>
          {customer.email && (
            <a href={`mailto:${customer.email}`} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <Mail className="size-4 shrink-0" />
              <span className="truncate">{customer.email}</span>
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 divide-x border-t pt-4">
        <div className="flex items-center gap-3 pr-3">
          <ShoppingBag className="size-5 shrink-0 text-muted-foreground" />
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Total Orders</span>
            <span className="text-base font-semibold">{customer.orderCount}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 pl-4">
          <CalendarDays className="size-5 shrink-0 text-muted-foreground" />
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Last Order</span>
            <span className="text-base font-semibold whitespace-nowrap">{formatLastOrder(customer.lastOrderAt)}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <SendMenuButton href={menuHref} className="flex-1" />
        <ViewCustomerButton id={customer.id} name={customer.name} />
      </div>
    </div>
  );
}

/** The list view's cells — same data as the card, merged the way Orders' rich list merges its own. */
export function CustomerListCells({ customer, menuHref, editAction }: { customer: CustomerDisplayData; menuHref: string | null; editAction: React.ReactNode }) {
  return (
    <>
      <TableCell className="px-3 py-3">
        <div className="flex items-center gap-3">
          <CustomerAvatar name={customer.name} className="size-10 text-sm" />
          <Link href={`/customers/${customer.id}`} className="max-w-48 truncate font-semibold hover:underline">
            {customer.name}
          </Link>
        </div>
      </TableCell>
      <TableCell className="px-3 py-3">
        <div className="flex flex-col gap-0.5 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <Phone className="size-4 shrink-0" />
            {formatPhoneDisplay(customer.phone)}
          </span>
          {customer.email && (
            <span className="flex items-center gap-2">
              <Mail className="size-4 shrink-0" />
              <span className="max-w-52 truncate">{customer.email}</span>
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="px-3 py-3">
        <div className="flex flex-wrap gap-1.5">
          <CustomerStatusBadge status={customer.status} />
          {!customer.isActive && <Badge variant="neutral">Inactive</Badge>}
        </div>
      </TableCell>
      <TableCell className="px-3 py-3">
        <span className="flex items-center gap-2 text-sm font-medium">
          <ShoppingBag className="size-5 shrink-0 text-muted-foreground" />
          {customer.orderCount}
        </span>
      </TableCell>
      <TableCell className="px-3 py-3">
        <span className="flex items-center gap-2 text-sm font-medium whitespace-nowrap">
          <CalendarDays className="size-5 shrink-0 text-muted-foreground" />
          {formatLastOrder(customer.lastOrderAt)}
        </span>
      </TableCell>
      <TableCell className="px-3 py-3">
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Send menu to ${customer.name} on WhatsApp`}
            className="text-[#128C4A]"
            disabled={!menuHref}
            render={menuHref ? <a href={menuHref} target="_blank" rel="noreferrer" /> : undefined}
            nativeButton={!menuHref}
          >
            <WhatsAppIcon className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label={`View ${customer.name}`} render={<Link href={`/customers/${customer.id}`} />} nativeButton={false}>
            <Eye className="size-4" />
          </Button>
          {editAction}
        </div>
      </TableCell>
    </>
  );
}
