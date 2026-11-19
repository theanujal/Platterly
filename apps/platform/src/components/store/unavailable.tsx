import Link from "next/link";
import { Icon } from "@/components/account/icons";
import "./store.css";

/** One empty-state for every Store screen that cannot show plans: an icon chip, a heading, one line and one way back. */
export function StoreNotice({ icon, title, children, href, action }: { icon: "refresh" | "building" | "lock" | "search"; title: string; children?: React.ReactNode; href: string; action: string }) {
  return (
    <main className="ps-page ps-manage">
      <section className="ps-notice">
        <span className="ps-notice-icon" aria-hidden="true"><Icon name={icon} size={22} /></span>
        <h1>{title}</h1>
        {children ? <p>{children}</p> : null}
        <Link href={href} className="ps-notice-action">{action}</Link>
      </section>
    </main>
  );
}

/** Shown when the live plans cannot be read from Ops. The Store never substitutes made-up prices for real ones. */
export function StoreUnavailable() {
  return (
    <StoreNotice icon="refresh" title="Plans are not available right now" href="/" action="Try again">
      We could not load our plans and prices. Please try again in a few minutes.
    </StoreNotice>
  );
}
