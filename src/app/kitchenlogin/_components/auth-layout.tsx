import { QrCode, UtensilsCrossed, ShieldCheck, TrendingUp } from "lucide-react";

const FEATURES = [
  { icon: QrCode, label: "QR-code digital menus, ready in minutes" },
  { icon: UtensilsCrossed, label: "Real-time order & kitchen management" },
  { icon: ShieldCheck, label: "Multi-branch, multi-role access control" },
  { icon: TrendingUp, label: "Reporting that grows with your business" },
];

// Chunk 4 — split-screen auth shell shared by sign-in and sign-up, matching
// the design system ported from MenuMate (orange gradient brand panel +
// feature bullets on one side, form on the other) but with Platterly's own
// tokens and copy.
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh w-full flex-col md:flex-row">
      <div className="hidden flex-col justify-center gap-10 bg-gradient-to-br from-primary to-[#9a3412] px-12 py-16 text-primary-foreground md:flex md:w-1/2">
        <div className="flex items-center gap-2 text-lg font-bold">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white p-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/platterly-mark.svg" alt="" className="size-full" />
          </span>
          Platterly
        </div>
        <div className="flex flex-col gap-4">
          <h1 className="max-w-md text-4xl font-extrabold text-balance">
            Run your catering business from one place
          </h1>
          <p className="max-w-sm text-sm text-primary-foreground/85">
            From enquiry to payment — quotations, menus, kitchen, and billing, all in one dashboard built for
            Indian caterers.
          </p>
        </div>
        <ul className="flex flex-col gap-4">
          {FEATURES.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-3 text-sm font-medium">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
                <Icon className="size-4" />
              </span>
              {label}
            </li>
          ))}
        </ul>
      </div>
      <main className="flex flex-1 items-center justify-center p-8">{children}</main>
    </div>
  );
}
