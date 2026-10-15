"use client";

import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormSection } from "@/app/(app)/orders/_components/order-form-parts";
import { formatCurrency } from "./approval-format";
import type { ApprovalPending } from "./types";

/**
 * "Quote the price per plate": a Custom Menu's dishes come from the customer with no price, so the kitchen quotes it here. The menu can't
 * be sent until it is quoted. Only someone who may change order prices (`canQuote`) and only while the menu is with the team gets the
 * field; everyone else sees the price, or why there is none yet.
 */
export function CustomMenuPriceCard({
  pricePerPlate,
  onPriceChange,
  quotedAmount,
  menuGuests,
  pending,
  onSave,
  canQuote = true,
  savedPrice,
  withTeam,
}: {
  pricePerPlate: string;
  onPriceChange: (value: string) => void;
  /** Price x guests while the field holds a number, else null. */
  quotedAmount: number | null;
  menuGuests: number;
  pending: ApprovalPending;
  onSave: () => void;
  /** The viewer may change order prices (`menus: approve` and `orders: edit`). */
  canQuote?: boolean;
  /** The quote already saved on the menu, or null. */
  savedPrice?: number | null;
  /** The menu is still with the team (Needs Review or Changes Requested): the only time a quote can change. */
  withTeam?: boolean;
}) {
  if (!canQuote) {
    const quoted = savedPrice !== null && savedPrice !== undefined;
    return (
      <FormSection
        icon={Wallet}
        title="Quote the price per plate"
        description="The customer picked their own dishes and saw no price. The per-plate quote becomes this order's menu amount."
      >
        <div className="flex flex-col gap-1 text-sm" data-testid="custom-price-readonly">
          {quoted ? (
            <p>
              <span className="font-medium">{formatCurrency(savedPrice)}</span> per plate, {formatCurrency(savedPrice * menuGuests)} for {menuGuests} guests.
            </p>
          ) : (
            <p className="text-warning">No price has been quoted yet, so this menu can&apos;t be sent to the customer.</p>
          )}
          <p className="text-muted-foreground">
            {withTeam === false
              ? "The price is locked while the menu is with the customer or approved. Recall the menu to change it."
              : "Only someone who can edit order prices can enter or change it."}
          </p>
        </div>
      </FormSection>
    );
  }
  return (
    <FormSection
      icon={Wallet}
      title="Quote the price per plate"
      description="The customer picked their own dishes and saw no price. Enter your per-plate quote — it becomes this order's menu amount."
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ma-price">Price per plate (₹)</Label>
          <Input id="ma-price" type="number" min={0} className="w-40" value={pricePerPlate} onChange={(e) => onPriceChange(e.target.value)} />
        </div>
        <Button type="button" size="md" disabled={pending !== null} onClick={onSave}>
          {pending === "price" ? "Saving…" : "Save price"}
        </Button>
        {quotedAmount !== null && (
          <span className="pb-2 text-sm text-muted-foreground">
            = {formatCurrency(quotedAmount)} for {menuGuests} guests
          </span>
        )}
      </div>
      {savedPrice === null && <p className="text-sm text-muted-foreground">This menu can&apos;t be sent to the customer until a price is saved.</p>}
    </FormSection>
  );
}
