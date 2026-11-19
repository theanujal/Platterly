import type { UiCardName } from "@/components/ui-cards";

/** The real Caterly screen shown for each card name (files in public/media, 2400 x 1500). */
const SCREENS: Record<UiCardName, { file: string; alt: string }> = {
  order: { file: "orders", alt: "The Orders page in Caterly: every order with its customer, event, guests, amount and status" },
  orders: { file: "orders", alt: "The Orders page in Caterly: every order with its customer, event, guests, amount and status" },
  calendar: { file: "calendar", alt: "The Calendar page in Caterly: booked events and orders on a month view" },
  menu: { file: "menu-planning", alt: "Menu planning in Caterly: dishes chosen for each meal with the price building as you go" },
  approval: { file: "menu-link", alt: "The page a customer opens from a link to review and approve their menu, with no login" },
  kitchen: { file: "kitchen-board", alt: "The Kitchen Dashboard in Caterly: orders moving from Pending to In Preparation to Ready" },
  staffing: { file: "logistics", alt: "An order in Caterly with its staffing and logistics: how many people each duty needs, vehicle and driver" },
  customers: { file: "customers", alt: "The Customers page in Caterly: every customer and their orders" },
  payment: { file: "payments", alt: "Payments in Caterly: advance and balance tracked on the order, with the invoice" },
};

/**
 * A coloured panel with the real screen set into it, as calendly.com and asana.com show their product: the screen is
 * large, starts a little in from the top left, and runs off the right and bottom edges. It sits in the soft
 * translucent frame (a pale ring around a white window) that the small product cards use. `crop` places the picture
 * inside its window: by default the whole screen from its top left; the cards pass an offset to show only the working part.
 */
export function ScreenPanel({ name, way, className = "", crop = "left-0 top-0 w-[205%]", screen: own }: { name: UiCardName; way: string; className?: string; crop?: string; screen?: { file: string; alt: string } }) {
  const screen = own ?? SCREENS[name];
  return (
    <div className={`cw-${way} relative overflow-hidden ${className}`}>
      <div className="absolute bottom-0 left-[7%] right-0 top-[10%] rounded-tl-[1.75rem] bg-paper/40 p-[0.4rem] pb-0 pr-0 ring-1 ring-paper/70">
        <div className="relative h-full w-full overflow-hidden rounded-tl-[1.35rem] bg-paper shadow-product">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/media/${screen.file}-hd.webp`} srcSet={`/media/${screen.file}-800.webp 800w, /media/${screen.file}-hd.webp 2400w`} sizes="(min-width: 1024px) 900px, 90vw" alt={screen.alt} width={2400} height={1500} loading="lazy" className={`absolute max-w-none ${crop}`} />
        </div>
      </div>
    </div>
  );
}
