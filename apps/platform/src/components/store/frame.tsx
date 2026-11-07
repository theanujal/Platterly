import Link from "next/link";
import type { ReactNode } from "react";
import "./store.css";

/** Platterly's public site, where the policies and contact pages live. Not live yet (no live environment), so these links work once the site is deployed. */
const SITE = "https://platterly.in";
const EMAIL = "hello@platterly.in";
const PHONE = "+91 7624964646";

/** The Store's header and footer around a page. The "Sample account" chip stands in for the signed-in user until sign-in exists. */
export function StoreFrame({ children }: { children: ReactNode }) {
  return (
    <div className="ps-frame">
      <header className="ps-header">
        <div className="ps-header-in">
          <Link href="/" className="ps-logo" aria-label="Platterly Store home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/platterly-mark.svg" alt="" width={28} height={28} />
            <span>Store</span>
          </Link>
          <nav className="ps-header-nav" aria-label="Store header">
            <a href={`${SITE}/contact/`}>Help</a>
            <span className="ps-user" title="Sign-in is not connected in this prototype">
              <span className="ps-avatar" aria-hidden="true">S</span>
              <span>Sample account</span>
            </span>
          </nav>
        </div>
      </header>

      <div className="ps-body">{children}</div>

      <footer className="ps-footer">
        <div className="ps-footer-in">
          <div className="ps-footer-top">
            <div>
              <h2>Contact us</h2>
              <p>Connect with our support team.</p>
              <p><a href={`mailto:${EMAIL}`}>{EMAIL}</a> &middot; <a href={`tel:${PHONE.replace(/\s/g, "")}`}>{PHONE}</a></p>
            </div>
            <div>
              <h2>Talk to our sales</h2>
              <p>For any clarifications or queries.</p>
              <p><a href={`${SITE}/talk-to-us/`}>Talk to us</a></p>
            </div>
          </div>
          <div className="ps-footer-bottom">
            <nav aria-label="Legal">
              <a href={`${SITE}/`}>Platterly.in</a>
              <a href={`${SITE}/terms/`}>Terms of Service</a>
              <a href={`${SITE}/privacy/`}>Privacy Policy</a>
              <a href={`${SITE}/security/`}>Security</a>
              <a href={`${SITE}/refund/`}>Refunds</a>
            </nav>
            <p>&copy; {new Date().getFullYear()} Platterly. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
