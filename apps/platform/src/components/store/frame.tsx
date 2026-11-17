import Link from "next/link";
import type { ReactNode } from "react";
import { getSessionRef } from "@/lib/session";
import { identityPool } from "@/modules/auth/identity-db";
import { getProfile } from "@/modules/account/profile";
import { Icon } from "@/components/account/icons";
import { AccountDrawer } from "@/components/drawer/account-drawer";
import { HelpDrawer } from "@/components/drawer/help-drawer";
import "./store.css";

/** Platterly's public site, where the policies and contact pages live. Not live yet (no live environment), so these links work once the site is deployed. */
const SITE = "https://platterly.in";
const EMAIL = "hello@platterly.in";
const PHONE = "+91 7624964646";

/** Up to two capital letters from a name: "Kitchen Admin" gives KA. */
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join("") || "?";

/** The signed-in person's name and email for the header, or null when nobody is signed in (or the identity database cannot be reached). */
async function whoIsSignedIn(): Promise<{ name: string; email: string } | null> {
  const ref = await getSessionRef();
  if (!ref) return null;
  const profile = await getProfile(identityPool(), ref.sub).catch(() => null);
  return profile ? { name: profile.name || profile.email, email: profile.email } : null;
}

/** The Store's header and footer around a page. The header shows who is signed in (with Sign out), or a Sign in link. */
export async function StoreFrame({ children }: { children: ReactNode }) {
  const who = await whoIsSignedIn();
  return (
    <div className="ps-frame">
      <header className="ps-header">
        <div className="ps-header-in">
          <Link href="/" className="ps-logo" aria-label="Platterly Store home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/platterly-mark.svg" alt="" width={32} height={32} />
            <span>Platterly Store</span>
          </Link>
          <nav className="ps-header-nav" aria-label="Store header">
            <HelpDrawer className="ps-help"><Icon name="lifebuoy" size={20} />Help</HelpDrawer>
            {who ? (
              <AccountDrawer signedIn person={{ name: who.name, email: who.email, business: null, initials: initials(who.name) }} />
            ) : (
              <a href="/auth/start" className="ps-signin">Sign in</a>
            )}
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
