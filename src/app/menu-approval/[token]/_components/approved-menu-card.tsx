import { CalendarDays, UtensilsCrossed, Users } from "lucide-react";
import { FormCard } from "@/components/public/form-section";
import type { ApprovalView } from "@/modules/menu-approvals/approval-view";

function inr(amount: number) {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** The compact "Approved Menu" card on the Venue & Delivery and Confirmation screens. */
export function ApprovedMenuCard({ view }: { view: ApprovalView }) {
  return (
    <FormCard className="gap-3 md:p-5" >
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <UtensilsCrossed className="size-5" />
        </span>
        <h2 className="text-[15px] font-semibold">Approved Menu</h2>
      </div>
      <div className="flex gap-3">
        {view.menu?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={view.menu.image} alt="" className="size-16 shrink-0 rounded-lg object-cover" />
        ) : (
          <span className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-muted">
            <UtensilsCrossed className="size-6 text-muted-foreground" />
          </span>
        )}
        <div className="flex min-w-0 flex-col gap-0.5 text-sm">
          <p className="font-semibold">{view.isCustomMenu ? "Custom Menu" : (view.menu?.name ?? "Your menu")}</p>
          {view.menu?.pricePerPlate != null && !view.isCustomMenu && <p className="text-muted-foreground">{inr(view.menu.pricePerPlate)} / plate</p>}
        </div>
      </div>
      <dl className="flex flex-col gap-1.5 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 shrink-0" />
          <dd>{[view.eventType, view.dateText].filter(Boolean).join(" · ")}</dd>
        </div>
        {view.guests !== null && (
          <div className="flex items-center gap-2">
            <Users className="size-4 shrink-0" />
            <dd>{view.guests} guests</dd>
          </div>
        )}
      </dl>
    </FormCard>
  );
}
