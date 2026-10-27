import { CalendarDays, UtensilsCrossed, Users } from "lucide-react";
import { FormCard } from "@/components/public/form-section";
import type { ApprovalView } from "@/modules/menu-approvals/approval-view";
import { OrderNumberRow } from "./order-number-row";
import { inr } from "@/modules/invoices/invoice-format";

/** "65 adults · 5 under 5 · 20 aged 5–10": the breakdown of the guest count, empty when there are no children to spell out. */
export function guestDetail(view: ApprovalView) {
  if (view.kids === 0) return "";
  return [
    view.adults !== null ? `${view.adults} adult${view.adults === 1 ? "" : "s"}` : null,
    view.childBelow5 > 0 ? `${view.childBelow5} under 5` : null,
    view.child5To10 > 0 ? `${view.child5To10} aged 5–10` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function guestsText(view: ApprovalView) {
  const detail = guestDetail(view);
  return `${view.guests} Guests${detail ? ` (${detail})` : ""}`;
}

/**
 * The "Event & Menu" card (the Venue & Delivery and Confirmation screens): every menu with its picture and per-plate price, then the
 * event type, date and guests, each with its details underneath (AJ, 2026-10-17).
 */
export function ApprovedMenuCard({ view, orderNumber = null, title = "Approved Menu" }: { view: ApprovalView; orderNumber?: string | null; title?: string }) {
  const menus = view.menus.length > 0 ? view.menus : [{ name: view.isCustomMenu ? "Custom Menu" : "Your menu", pricePerPlate: null, image: null }];
  return (
    <FormCard className="gap-4 md:p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <UtensilsCrossed className="size-5" />
        </span>
        <h2 className="text-[15px] font-semibold">{title}</h2>
      </div>
      <OrderNumberRow orderNumber={orderNumber} />
      <ul className="flex flex-col gap-3" data-testid="selected-menus">
        {menus.map((menu) => (
          <li key={menu.name} className="flex items-center gap-3">
            {menu.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={menu.image} alt="" loading="lazy" className="size-14 shrink-0 rounded-lg object-cover" />
            ) : (
              <span className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-muted">
                <UtensilsCrossed className="size-6 text-muted-foreground" />
              </span>
            )}
            <div className="min-w-0 text-sm">
              <p className="font-semibold">{menu.name}</p>
              {menu.pricePerPlate != null && !view.isCustomMenu && <p className="text-muted-foreground">{inr(menu.pricePerPlate)} / plate</p>}
            </div>
          </li>
        ))}
      </ul>
      <dl className="flex flex-col gap-3 border-t border-border pt-4 text-sm">
        <div className="flex items-start gap-3">
          <CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <dd>
            {view.eventType && <p className="font-semibold">{view.eventType}</p>}
            <p className={view.eventType ? "text-muted-foreground" : "font-semibold"}>{view.dateText}</p>
          </dd>
        </div>
        {view.guests !== null && (
          <div className="flex items-start gap-3">
            <Users className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <dd data-testid="approved-guests">
              <p className="font-semibold">{view.guests} Guests</p>
              {guestDetail(view) && <p className="text-muted-foreground">{guestDetail(view)}</p>}
            </dd>
          </div>
        )}
      </dl>
    </FormCard>
  );
}
