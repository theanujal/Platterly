"use client";

import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/account/icons";
import { HelpDocuments } from "./help-docs";
import "./drawer.css";

/** Platterly's own social profiles (the same three the marketing site's footer links to). */
const SOCIAL: { name: string; icon: IconName; href: string }[] = [
  { name: "Facebook", icon: "facebook", href: "https://www.facebook.com/platterlyindia" },
  { name: "Instagram", icon: "instagram", href: "https://www.instagram.com/platterlyindia/" },
  { name: "LinkedIn", icon: "linkedin", href: "https://www.linkedin.com/company/platterlyindia" },
];

export interface DrawerPerson {
  name: string;
  email: string;
  /** The business, when known; otherwise the header shows the email under the name. */
  business: string | null;
  initials: string;
  photo?: string;
}

/**
 * The name at the top right of the Account and the Store opens this drawer from the right, the same one Caterly has (its look: who you are, links, Sign out fixed at
 * the bottom), so a person sees one account menu in every Platterly product. Account and Store are both on the Platform, on sibling hosts, so the links to the other
 * host are built from the address the page was opened on.
 */
export function AccountDrawer({ person, signedIn }: { person: DrawerPerson; signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(person.email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* Clipboard blocked: nothing to do. */
    }
  };
  /** The drawer is drawn only after a click, so the address bar is available here. */
  const hostFor = (to: string) => `${window.location.protocol}//${window.location.host.replace(/^(account|store|auth)\./, `${to}.`)}`;
  const avatar = person.photo ? (
    // eslint-disable-next-line @next/next/no-img-element -- the person's own photo, served by the Platform
    <img src={person.photo} alt="" className="pd-photo" />
  ) : (
    <span className="pd-initials" aria-hidden="true">{person.initials}</span>
  );

  return (
    <>
      <button ref={trigger} type="button" className="pd-chip" aria-haspopup="dialog" aria-expanded={open} aria-label="Account menu" onClick={() => setOpen(true)}>
        <span className="pd-chip-name">
          <strong>{person.name}</strong>
          <small>{person.business ?? person.email}</small>
        </span>
        <span className="pd-chip-avatar">{person.photo ? <img src={person.photo} alt="" className="pd-photo" /> : <span className="pd-initials" aria-hidden="true">{person.initials}</span>}</span>
        <Icon name="chevronDown" size={16} />
      </button>
      {open && <div className="pd-scrim" onClick={close} aria-hidden="true" />}
      {open && (
        <aside className="pd-drawer" role="dialog" aria-modal="true" aria-label="Account" data-testid="account-drawer">
          <button ref={closeButton} type="button" className="pd-close" aria-label="Close" onClick={close}>
            <Icon name="x" size={18} />
          </button>
          <div className="pd-scroll">
            <div className="pd-head">
              <span className="pd-big">{avatar}</span>
              <p className="pd-name">{person.name}</p>
              {person.business && <p className="pd-sub">{person.business}</p>}
              <p className="pd-sub pd-email">
                {person.email}
                <button type="button" className="pd-copy" aria-label="Copy email" onClick={copyEmail}>
                  <Icon name={copied ? "check" : "link"} size={14} />
                </button>
              </p>
            </div>
            <nav className="pd-links" aria-label="Account links">
              <a href={`${hostFor("account")}/`} onClick={close}><Icon name="user" size={16} /> Account</a>
              <a href={`${hostFor("store")}/`} onClick={close}><Icon name="layers" size={16} /> Store</a>
              <a href={`${hostFor("account")}/profile`} onClick={close}><Icon name="user" size={16} /> My Profile</a>
              <a href={`${hostFor("account")}/security`} onClick={close}><Icon name="shield" size={16} /> Security</a>
            </nav>
            <HelpDocuments onNavigate={close} />
            <section className="pd-social" aria-label="Follow Platterly">
              <h2>Follow us</h2>
              <div className="pd-social-row">
                {SOCIAL.map((s) => (
                  <a key={s.name} href={s.href} className="pd-social-btn" target="_blank" rel="noopener noreferrer" aria-label={`Platterly on ${s.name}`}>
                    <Icon name={s.icon} size={18} />
                  </a>
                ))}
              </div>
            </section>
          </div>
          {signedIn && (
            <form method="post" action="/auth/signout" className="pd-foot">
              <button type="submit" className="pd-signout"><Icon name="logout" size={16} /> Sign out</button>
            </form>
          )}
        </aside>
      )}
    </>
  );
}
