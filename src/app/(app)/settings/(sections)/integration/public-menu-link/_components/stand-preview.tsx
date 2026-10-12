import { UtensilsCrossed } from "lucide-react";

/**
 * A live preview of the printed Order QR stand's DESIGN (not of the acrylic stand itself): an A6 (4 x 6 in) card with the
 * kitchen's logo and name, the QR to its direct public link and "Powered by Platterly" always at the bottom. One fixed template.
 * The same layout is drawn into the print file in Platterly Ops, so what the kitchen sees here is what is printed.
 */
export function StandPreview({ kitchenName, logo, qr, linkUrl }: { kitchenName: string; logo: string | null; qr: string | null; linkUrl: string | null }) {
  const display = linkUrl?.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return (
    <div className="mx-auto flex aspect-[2/3] w-56 flex-col items-center rounded-2xl border-[3px] border-primary bg-white px-5 pt-7 pb-4 text-center" data-testid="stand-preview">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- the kitchen's own uploaded logo
        <img src={logo} alt="" className="max-h-12 w-auto max-w-[9.5rem] object-contain" />
      ) : (
        <UtensilsCrossed className="mt-1 size-9 text-primary" aria-hidden />
      )}
      <p className="mt-3 line-clamp-2 text-base leading-tight font-semibold" data-testid="stand-preview-name">
        {kitchenName}
      </p>
      <p className="mt-1.5 text-[11px] text-muted-foreground">Scan to see our menu and order</p>
      {qr ? (
        // eslint-disable-next-line @next/next/no-img-element -- a generated data URL
        <img src={qr} alt="" className="mt-3 size-28" />
      ) : (
        <div className="mt-3 flex size-28 items-center justify-center rounded-md bg-muted text-[10px] text-muted-foreground">Your QR code</div>
      )}
      <p className="mt-2 w-full truncate text-[9px] text-muted-foreground">{display ?? "your link"}</p>
      <div className="mt-auto flex w-full items-center justify-center gap-1 border-t border-border pt-2 text-[9px] text-muted-foreground">
        <span>Powered by</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/platterly-logo.svg" alt="Platterly" className="h-3 w-auto" />
      </div>
    </div>
  );
}
