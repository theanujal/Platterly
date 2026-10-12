"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Package } from "lucide-react";
import type { ShipTo, StandFulfilment, StandOffer, StandOrderView } from "@platterly/contract";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InfoBox, SettingsSection } from "../../../../_components/settings-ui";
import { StandPreview } from "./stand-preview";
import { startStandOrderAction, verifyStandOrderAction } from "../stand-actions";

const STEP_LABEL: Record<StandFulfilment, string> = { PLACED: "Placed", PRINTING: "Printing", SHIPPED: "Shipped", DELIVERED: "Delivered" };
const STEP_VARIANT: Record<StandFulfilment, "info" | "warning" | "success" | "neutral"> = { PLACED: "info", PRINTING: "warning", SHIPPED: "info", DELIVERED: "success" };

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

function loadCheckout(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

interface Props {
  unavailable: boolean;
  offer: StandOffer | null;
  orders: StandOrderView[];
  linkUrl: string | null;
  kitchenName: string;
  kitchenLogo: string | null;
  qr: string | null;
  shipTo: ShipTo;
  canOrder: boolean;
}

/** Settings -> Platterly Link -> Order QR stand (AJ, 2026-10-12): preview the design, choose 1 to 3, ship to the business address (or another), pay, track. */
export function OrderStandSection({ unavailable, offer, orders, linkUrl, kitchenName, kitchenLogo, qr, shipTo, canOrder }: Props) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  // Ship to the business address by default; the form only appears when the owner picks a different address (AJ, 2026-10-12).
  const businessComplete = [shipTo.name, shipTo.phone, shipTo.addressLine1, shipTo.city, shipTo.state, shipTo.postalCode].every((v) => v.trim() !== "");
  const [different, setDifferent] = useState(!businessComplete);
  const [other, setOther] = useState<ShipTo>({ name: "", phone: "", addressLine1: "", addressLine2: null, city: "", state: "", postalCode: "", country: shipTo.country });
  const address = different ? other : shipTo;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState(false);

  const set = (key: keyof ShipTo, value: string) => setOther((a) => ({ ...a, [key]: key === "addressLine2" || key === "country" ? value || null : value }));
  const total = offer ? Math.round(offer.unitTotal * quantity * 100) / 100 : 0;
  const amount = offer ? Math.round(offer.unitAmount * quantity * 100) / 100 : 0;
  const gst = offer ? Math.round((total - amount) * 100) / 100 : 0;

  async function pay() {
    setError(null);
    setPlaced(false);
    setBusy(true);
    const started = await startStandOrderAction(quantity, address);
    if (!started.ok) {
      setBusy(false);
      return setError(started.error);
    }
    if (!(await loadCheckout()) || !window.Razorpay) {
      setBusy(false);
      return setError("Could not load the payment window. Please check your connection and try again.");
    }
    new window.Razorpay({
      key: started.keyId,
      amount: started.amountPaise,
      currency: "INR",
      name: started.businessName,
      description: started.description,
      order_id: started.razorpayOrderId,
      theme: { color: "#FF6900" },
      handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        const verified = await verifyStandOrderAction(response);
        setBusy(false);
        if (!verified.ok) return setError(verified.error);
        setPlaced(true);
        router.refresh();
      },
      modal: { ondismiss: () => setBusy(false) },
    }).open();
  }

  const body = (() => {
    if (unavailable) return <InfoBox tone="neutral"><p>Order QR stands cannot be ordered right now. Please try again in a little while.</p></InfoBox>;
    if (!linkUrl) return <InfoBox tone="info"><p>Set your Platterly link first. The QR on the stand points to it, so it has to exist before the stand is printed.</p></InfoBox>;
    if (!offer?.available) return <InfoBox tone="neutral"><p>The Order QR stand is not on sale yet. Check back soon.</p></InfoBox>;
    if (!canOrder) return <InfoBox tone="neutral"><p>Only the account owner can order stands. Please ask them to sign in and order.</p></InfoBox>;
    return (
      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void pay();
        }}
      >
        <div className="flex flex-col gap-2">
          <Label>How many stands?</Label>
          <div className="flex gap-2" role="group" aria-label="Number of stands">
            {Array.from({ length: offer.maxPerOrder }, (_, i) => i + 1).map((n) => (
              <Button key={n} type="button" size="md" variant={n === quantity ? "default" : "outline"} aria-pressed={n === quantity} onClick={() => setQuantity(n)}>
                {n}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3" data-testid="stand-shipto">
          <Label>Ship to</Label>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Ship to">
            {[
              { value: false, title: "My business address", disabled: !businessComplete },
              { value: true, title: "A different address", disabled: false },
            ].map((option) => (
              <button
                key={option.title}
                type="button"
                role="radio"
                aria-checked={different === option.value}
                disabled={option.disabled}
                onClick={() => setDifferent(option.value)}
                className={`flex items-center gap-2 rounded-lg border p-2.5 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50 ${different === option.value ? "border-primary bg-accent" : "border-border"}`}
              >
                <span className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${different === option.value ? "border-primary" : "border-input"}`}>
                  {different === option.value && <span className="size-2 rounded-full bg-primary" />}
                </span>
                <span className="font-medium">{option.title}</span>
              </button>
            ))}
          </div>
          {!different && (
            <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground" data-testid="stand-business-address">
              <span className="font-medium text-foreground">{shipTo.name}</span> · {shipTo.phone}
              <br />
              {[shipTo.addressLine1, shipTo.addressLine2, shipTo.city, shipTo.state, shipTo.postalCode].filter(Boolean).join(", ")}
            </p>
          )}
          {!businessComplete && <p className="text-xs text-muted-foreground">Your business profile has no full address yet, so enter the address to ship to.</p>}
          {different && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="stand-name">Name</Label>
              <Input id="stand-name" required value={address.name} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="stand-phone">Phone</Label>
              <Input id="stand-phone" required inputMode="tel" value={address.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="stand-address1">Address</Label>
              <Input id="stand-address1" required value={address.addressLine1} onChange={(e) => set("addressLine1", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="stand-address2">Address line 2 (optional)</Label>
              <Input id="stand-address2" value={address.addressLine2 ?? ""} onChange={(e) => set("addressLine2", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="stand-city">City</Label>
              <Input id="stand-city" required value={address.city} onChange={(e) => set("city", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="stand-state">State</Label>
              <Input id="stand-state" required value={address.state} onChange={(e) => set("state", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="stand-pin">PIN code</Label>
              <Input id="stand-pin" required value={address.postalCode} onChange={(e) => set("postalCode", e.target.value)} />
            </div>
            </div>
          )}
        </div>

        <dl className="flex flex-col gap-2 rounded-lg bg-muted/50 p-4 text-sm tabular-nums" data-testid="stand-price">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">
              {quantity} × {rupees(offer.unitAmount)}
            </dt>
            <dd>{rupees(amount)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">GST ({offer.gstPercent}%)</dt>
            <dd>{rupees(gst)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Shipping</dt>
            <dd>Included</dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-border pt-2 font-semibold">
            <dt>Total</dt>
            <dd data-testid="stand-total">{rupees(total)}</dd>
          </div>
        </dl>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {placed && (
          <p role="status" className="text-sm text-success" data-testid="stand-placed">
            Thank you, your order is placed. We will print your stands and email you when they ship.
          </p>
        )}
        <Button type="submit" size="md" className="self-start" disabled={busy}>
          <Package className="size-4" />
          {busy ? "Opening payment…" : `Pay ${rupees(total)} and order`}
        </Button>
      </form>
    );
  })();

  return (
    <SettingsSection title="Order QR stand" description="A printed acrylic stand (4 × 6 in) with your logo, name and a QR code to your link, for your counter or table. Shipping is included.">
      <div className="flex flex-col gap-6" data-testid="stand-section">
        <div className="flex flex-col gap-2">
          <StandPreview kitchenName={kitchenName} logo={kitchenLogo} qr={qr} linkUrl={linkUrl} />
          <p className="text-center text-xs text-muted-foreground">Preview of the printed design</p>
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <InfoBox tone="warning" title="Keep your link the same">
            <p>The QR is your link as it is today. If you change your link later, the stands you have already printed will stop working.</p>
          </InfoBox>
          {body}
        </div>
      </div>

      {orders.length > 0 && (
        <div className="mt-6 flex flex-col gap-3" data-testid="stand-orders">
          <h3 className="text-sm font-semibold">Your stand orders</h3>
          <ul className="flex flex-col gap-2">
            {orders.map((order) => (
              <li key={order.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm" data-testid="stand-order">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-medium">
                    {order.quantity} stand{order.quantity === 1 ? "" : "s"} · {rupees(order.total)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Ordered {day(order.createdAt)}
                    {order.invoiceNumber ? ` · Invoice ${order.invoiceNumber}` : ""}
                  </span>
                  {order.fulfilment === "SHIPPED" && order.trackingNote ? <span className="text-xs text-muted-foreground">Delivery note: {order.trackingNote}</span> : null}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={STEP_VARIANT[order.fulfilment]}>{STEP_LABEL[order.fulfilment]}</Badge>
                  {canOrder && order.invoiceNumber ? (
                    <Button variant="outline" size="md" render={<a href={`/settings/integration/public-menu-link/stand-invoice/${order.id}`} />} nativeButton={false}>
                      <Download className="size-4" />
                      Invoice
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SettingsSection>
  );
}
