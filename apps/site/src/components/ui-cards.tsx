import type { ReactNode } from "react";

/**
 * Small designed versions of single Catering screens (not whole-page screenshots): one card per idea, set in the
 * double frame calendly.com uses (a soft translucent ring, then a white card). They use sample data and follow the
 * real screens (orders list, calendar, menu planning, approval, kitchen board, staffing, payments, customers).
 * Sizes are in em so one card works small (how it works) and large (a chapter).
 */
type Tone = "neutral" | "warn" | "info" | "good";
const TONE: Record<Tone, string> = { neutral: "bg-ink-navy/8 text-ink-navy", warn: "bg-[#fff0c9] text-ink-navy", info: "bg-[#e2edff] text-ink-navy", good: "bg-[#dcf5d6] text-ink-navy" };

function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-[0.7em] py-[0.2em] text-[0.78em] font-medium ${TONE[tone]}`}>{children}</span>;
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-[1em] rounded-[0.8em] bg-pebble px-[1em] py-[0.7em]">
      <span className="text-[0.82em] text-slate-gray">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span aria-hidden className={`relative inline-block h-[1.5em] w-[2.75em] shrink-0 rounded-full ${on ? "bg-ink-navy" : "bg-ink-navy/20"}`}>
      <span className={`absolute top-[0.125em] size-[1.25em] rounded-full bg-paper shadow-card ${on ? "left-[1.4em]" : "left-[0.125em]"}`} />
    </span>
  );
}

const BODY: Record<string, { title: string; body: ReactNode }> = {
  order: {
    title: "New order",
    body: (
      <>
        <Row label="Customer" value="Sample customer" />
        <Row label="Event" value="Wedding · 18 Oct" />
        <Row label="Guests" value="380 + 70 children" />
      </>
    ),
  },
  orders: {
    title: "Orders",
    body: (
      <>
        {[
          ["ORD-0012", "Wedding", "380 guests", "Sent to kitchen", "info"],
          ["ORD-0011", "Corporate lunch", "120 guests", "Awaiting customer", "warn"],
          ["ORD-0010", "Birthday party", "60 guests", "Delivered", "good"],
        ].map(([id, event, guests, status, tone]) => (
          <div key={id} className="flex items-center justify-between gap-[1em] rounded-[0.8em] bg-pebble px-[1em] py-[0.7em]">
            <span className="min-w-0">
              <span className="block text-[0.72em] font-medium text-brand-dark">{id}</span>
              <span className="block truncate font-medium">{event}</span>
              <span className="block text-[0.78em] text-slate-gray">{guests}</span>
            </span>
            <Pill tone={tone as Tone}>{status}</Pill>
          </div>
        ))}
      </>
    ),
  },
  calendar: {
    title: "October",
    body: (
      <>
        <div className="grid grid-cols-7 gap-[0.3em] text-center text-[0.8em]">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <span key={i} className="pb-[0.3em] text-[0.8em] text-slate-gray">
              {d}
            </span>
          ))}
          {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => {
            const busy = [3, 4, 11, 17, 18, 24].includes(day);
            const hot = day === 17;
            return (
              <span key={day} className={`relative rounded-[0.5em] py-[0.35em] ${hot ? "bg-product font-medium" : busy ? "bg-product-tint font-medium" : ""}`}>
                {day}
                {busy && !hot && <i aria-hidden className="absolute inset-x-[30%] bottom-[0.12em] h-[0.15em] rounded-full bg-product" />}
              </span>
            );
          })}
        </div>
        <div className="flex items-center justify-between rounded-[0.8em] bg-badge-fill px-[1em] py-[0.6em]">
          <span className="text-[0.82em] text-slate-gray">17 Oct</span>
          <span className="font-medium">3 events</span>
        </div>
      </>
    ),
  },
  menu: {
    title: "Menu planning",
    body: (
      <>
        <Row label="Lunch" value="Veg Thali" />
        <Row label="Dinner" value="Royal Buffet" />
        <div className="flex items-center justify-between rounded-[0.8em] bg-badge-fill px-[1em] py-[0.7em]">
          <span className="text-[0.82em] text-slate-gray">Total so far</span>
          <span className="text-[1.15em] font-medium">₹1,71,000</span>
        </div>
      </>
    ),
  },
  approval: {
    title: "Menu approval",
    body: (
      <>
        <div className="flex items-center justify-between gap-[1em] rounded-[0.8em] bg-pebble px-[1em] py-[0.8em]">
          <span className="font-medium">Approved by customer</span>
          <Toggle on />
        </div>
        <div className="flex items-center justify-between gap-[1em] rounded-[0.8em] bg-pebble px-[1em] py-[0.8em]">
          <span className="font-medium">Sent to kitchen</span>
          <Toggle on={false} />
        </div>
      </>
    ),
  },
  kitchen: {
    title: "Kitchen board",
    body: (
      <>
        {[
          ["Pending", false],
          ["In preparation", true],
          ["Ready", false],
        ].map(([label, active]) => (
          <div key={label as string} className={`flex items-center gap-[0.8em] rounded-[0.8em] px-[1em] py-[0.7em] font-medium ${active ? "bg-product" : "bg-pebble text-slate-gray"}`}>
            <span aria-hidden className={`size-[0.6em] rounded-full ${active ? "bg-ink-navy" : "bg-ink-navy/25"}`} />
            {label as string}
          </div>
        ))}
      </>
    ),
  },
  staffing: {
    title: "Staffing",
    body: (
      <>
        <Row label="Cooks" value="12" />
        <Row label="Servers" value="20" />
        <Row label="Drivers" value="2" />
      </>
    ),
  },
  customers: {
    title: "Customers",
    body: (
      <>
        {[
          ["SC", "Sample customer", "2 orders"],
          ["AB", "Another customer", "1 order"],
          ["CD", "Corporate client", "5 orders"],
        ].map(([ini, name, count]) => (
          <div key={ini} className="flex items-center gap-[0.9em] rounded-[0.8em] bg-pebble px-[0.9em] py-[0.6em]">
            <span className="flex size-[2.2em] shrink-0 items-center justify-center rounded-full bg-product text-[0.8em] font-medium">{ini}</span>
            <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
            <span className="text-[0.78em] text-slate-gray">{count}</span>
          </div>
        ))}
      </>
    ),
  },
  payment: {
    title: "Payments",
    body: (
      <>
        <div>
          <div className="flex justify-between text-[0.82em] text-slate-gray">
            <span>Advance paid</span>
            <span>40%</span>
          </div>
          <div className="mt-[0.5em] h-[0.6em] rounded-full bg-ink-navy/10">
            <div className="h-full w-[40%] rounded-full bg-product" />
          </div>
        </div>
        <Row label="Balance" value="₹1,02,600" />
        <span className="inline-flex items-center justify-center rounded-[0.6em] bg-ink-navy px-[1em] py-[0.7em] text-[0.85em] font-medium text-cloud">Create invoice</span>
      </>
    ),
  },
};

export type UiCardName = keyof typeof BODY;

/**
 * One card in calendly's double frame: a soft translucent ring around a white card. `size` sets the text size the
 * whole card scales from (small in a row of steps, large in a chapter).
 */
export function UiCard({ name, size = "md", className = "" }: { name: UiCardName; size?: "sm" | "md" | "lg"; className?: string }) {
  const card = BODY[name];
  const fs = size === "lg" ? "text-[1.0625rem] sm:text-[1.1875rem]" : size === "sm" ? "text-[0.875rem]" : "text-[1rem]";
  return (
    <div className={`rounded-[2em] bg-paper/40 p-[0.4em] ring-1 ring-paper/70 ${fs} ${className}`}>
      <div className="rounded-[1.6em] bg-paper p-[1.4em] shadow-product">
        <p className="text-[1.5em] font-medium leading-tight tracking-tight">{card.title}</p>
        <div className="mt-[1em] flex flex-col gap-[0.7em]">{card.body}</div>
      </div>
    </div>
  );
}
