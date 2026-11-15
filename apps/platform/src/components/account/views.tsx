"use client";

import Link from "next/link";
import { initials } from "@/lib/account/catalogue";
import { ProductCards } from "./cards";
import { BusinessGate, DataGate } from "./data";
import { Icon, type IconName } from "./icons";
import { AccountShell } from "./shell";
import { useEffect, useState } from "react";
import { DataRights } from "./data-rights";
import { Menu } from "./payment-methods";
import { RecoveryEmail } from "./recovery-email";
import { TwoFactor } from "./two-factor";
import { ChangeEmail } from "./change-email";
import { ChangePassword } from "./change-password";
import { BillingSummary } from "./billing-views";
import { SignInHistory } from "./sign-in-history";
import { ProfileDetails } from "./profile-details";
import { Avatar, Badge, PageHeader } from "./ui";

/** What the Overview's top shows: the welcome line and the account card, from the Account's stored profile (falling back to the email while loading). */
function OverviewTop({ email, emailVerified, fallbackName, storeOrigin }: { email: string; emailVerified: boolean; fallbackName?: string; storeOrigin: string }) {
  const [profile, setProfile] = useState<{ name: string; phone: string } | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/account/profile", { cache: "no-store", credentials: "same-origin" });
        const body = (await res.json()) as { profile?: { name: string; phone: string } };
        if (alive && res.ok && body.profile) setProfile({ name: body.profile.name, phone: body.profile.phone });
      } catch {
        /* the card keeps showing the email */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  const name = profile?.name || fallbackName || email;
  return (
    <>
      <PageHeader title={`Welcome back, ${name} \u{1F44B}`} lede="Your Platterly account gives you access to your products, subscriptions and billing, all in one place." />
      <div className="pa-ov-top">
        <section className="pa-card pa-acct-card" aria-label="Your account">
          <Avatar label={initials(name)} size="xl" round />
          <div className="pa-acct-card-id">
            <span className="pa-hint">Your account</span>
            <h3>{name}</h3>
            <p className="pa-line">
              <Icon name="mail" size={14} /> {email}
              <Badge tone={emailVerified ? "success" : "warning"}>{emailVerified ? "Email verified" : "Email not verified"}</Badge>
            </p>
            {profile?.phone ? (
              <p className="pa-line">
                <Icon name="phone" size={14} /> {profile.phone}
              </p>
            ) : null}
          </div>
          <Link href="/profile" className="pa-btn pa-btn-outline">
            <Icon name="pencil" size={15} /> Edit profile
          </Link>
        </section>
        <section className="pa-card pa-quick" aria-labelledby="ov-quick">
          <h2 id="ov-quick">Quick actions</h2>
          <div className="pa-quick-grid">
            <a href={storeOrigin} className="pa-quick-item">
              <span className="pa-quick-tile"><Icon name="plus" size={20} /></span>
              Add product
            </a>
            <Link href="/subscriptions" className="pa-quick-item">
              <span className="pa-quick-tile"><Icon name="card" size={20} /></span>
              Manage billing
            </Link>
            <Link href="/security" className="pa-quick-item">
              <span className="pa-quick-tile"><Icon name="users" size={20} /></span>
              Account settings
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}

export function OverviewView({ storeOrigin }: { storeOrigin: string }) {
  return (
    <AccountShell>
      <DataGate>
        {(overview) => (
          <>
            <OverviewTop email={overview.user.email} emailVerified={overview.user.emailVerified} fallbackName={overview.user.name} storeOrigin={storeOrigin} />

            <section aria-labelledby="ov-products">
              <div className="pa-section-head">
                <span>
                  <h2 id="ov-products">Your products</h2>
                  <p className="pa-hint">Access and manage your Platterly products.</p>
                </span>
                <Link href="/products" className="pa-link">
                  All products <Icon name="chevronRight" size={14} />
                </Link>
              </div>
              <BusinessGate overview={overview}>
                {(b) => (
                  <ProductCards products={b.products} openUrls={b.openUrls} compact limit={4} className="pa-grid-2" />
                )}
              </BusinessGate>
            </section>

            <BillingSummary />
          </>
        )}
      </DataGate>
    </AccountShell>
  );
}

export function ProductsView() {
  return (
    <AccountShell>
      <PageHeader title="My Products" lede="Products available to your business." />
      <DataGate>
        {(overview) => (
          <BusinessGate overview={overview}>
            {(b) => (
              <ProductCards products={b.products} openUrls={b.openUrls} className="pa-product-grid" />
            )}
          </BusinessGate>
        )}
      </DataGate>
    </AccountShell>
  );
}

export function ProfileView() {
  return (
    <AccountShell>
      <PageHeader title="My Profile" lede="Manage your personal details and account settings. They apply to every business and product." />
      <DataGate>
        {() => (
          <>
            <ProfileDetails
              aside={
                <>
                  <section className="pa-card pa-profile-link" aria-labelledby="pf-security">
                    <span className="pa-profile-link-text">
                      <h2 id="pf-security"><Icon name="shield" size={20} /> Security</h2>
                      <span className="pa-hint">Password, two-step verification and sign-in settings.</span>
                    </span>
                    <Link href="/security" className="pa-btn pa-btn-outline">
                      Open Security <Icon name="arrowRight" size={16} />
                    </Link>
                  </section>
                  <section className="pa-card pa-profile-link" aria-labelledby="pf-devices">
                    <span className="pa-profile-link-text">
                      <h2 id="pf-devices"><Icon name="monitor" size={20} /> Devices</h2>
                      <span className="pa-hint">See and manage the devices where you&apos;re signed in.</span>
                    </span>
                    <Link href="/devices" className="pa-btn pa-btn-outline">
                      View Devices <Icon name="arrowRight" size={16} />
                    </Link>
                  </section>
                  <DataRights />
                </>
              }
            />
          </>
        )}
      </DataGate>
    </AccountShell>
  );
}

type Device = { id: string; label: string; lastActive: string; current: boolean };
type DevicesState = { phase: "loading" } | { phase: "error" } | { phase: "ready"; devices: Device[] };

/** Signed-in devices (F4.3.1): the person's own live sessions from the server, with sign out for one device and for all of them. */
function Devices() {
  const [state, setState] = useState<DevicesState>({ phase: "loading" });
  const [busy, setBusy] = useState(false);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/account/sessions", { cache: "no-store", credentials: "same-origin" });
        if (!alive) return;
        if (!res.ok) return setState({ phase: "error" });
        const body = (await res.json()) as { devices?: Device[] };
        if (alive) setState(Array.isArray(body.devices) ? { phase: "ready", devices: body.devices } : { phase: "error" });
      } catch {
        if (alive) setState({ phase: "error" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [tick]);

  async function revoke(payload: { id: string } | { all: true }) {
    setBusy(true);
    try {
      const res = await fetch("/api/account/sessions/revoke", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify(payload) });
      if (!res.ok) return setState({ phase: "error" });
      const body = (await res.json()) as { signedOut?: boolean };
      // Ending the session this page is using signs the person out: go back to the start.
      if (body.signedOut) window.location.assign("/");
      else setTick((t) => t + 1);
    } catch {
      setState({ phase: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pa-card pa-form" aria-labelledby="sc-devices">
      <div className="pa-section-head">
        <span>
          <h2 id="sc-devices">Your signed-in devices</h2>
          <span className="pa-hint">These are the devices currently using your account.</span>
        </span>
        <button type="button" className="pa-btn pa-btn-outline" disabled={busy || state.phase !== "ready"} onClick={() => revoke({ all: true })}>
          <Icon name="logout" size={15} /> Sign out of all devices
        </button>
      </div>
      {state.phase === "loading" && (
        <p className="pa-muted" role="status" aria-busy="true">
          Loading your devices…
        </p>
      )}
      {state.phase === "error" && (
        <p className="pa-muted" role="alert">
          We could not load your devices. Nothing was changed. Please reload the page.
        </p>
      )}
      {state.phase === "ready" && (
        <ul className="pa-sessions" aria-label="Signed-in devices">
          {state.devices.map((d) => (
            <li className={`pa-session pa-device-row${d.current ? " is-current" : ""}`} key={d.id}>
              <span className="pa-device-tile"><Icon name={/iphone|android|mobile|ipad/i.test(d.label) ? "smartphone" : "laptop"} size={22} /></span>
              <span className="pa-session-text">
                <span className="pa-row-label">
                  {d.label} {d.current && <Badge tone="success">Current device</Badge>}
                </span>
              </span>
              <span className="pa-device-active">
                <span className="pa-hint">Last active</span>
                <span>{new Date(d.lastActive).toLocaleString()}</span>
              </span>
              {d.current ? (
                <span className="pa-device-more" aria-hidden="true" />
              ) : (
                <Menu label={`More about ${d.label}`} triggerClass="pa-btn pa-btn-outline pa-more" items={[{ text: "Sign out", icon: "logout", onClick: () => revoke({ id: d.id }) }]}>
                  <Icon name="more" size={18} />
                </Menu>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type TrustedDevice = { id: string; label: string; lastUsed: string };
type TrustedState = { phase: "loading" } | { phase: "error" } | { phase: "ready"; devices: TrustedDevice[] };

/** Trusted devices (AJ, 2026-11-10): browsers that skip the two-step code until the person removes them or changes their password. */
function TrustedDevices() {
  const [state, setState] = useState<TrustedState>({ phase: "loading" });
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/account/trusted-devices", { cache: "no-store", credentials: "same-origin" });
        if (!alive) return;
        if (!res.ok) return setState({ phase: "error" });
        const body = (await res.json()) as { devices?: TrustedDevice[] };
        if (alive) setState(Array.isArray(body.devices) ? { phase: "ready", devices: body.devices } : { phase: "error" });
      } catch {
        if (alive) setState({ phase: "error" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [tick]);

  async function remove(payload: { id: string } | { all: true }) {
    setBusy(true);
    try {
      const res = await fetch("/api/account/trusted-devices", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify(payload) });
      if (!res.ok) return setState({ phase: "error" });
      setTick((t) => t + 1);
    } catch {
      setState({ phase: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pa-card pa-form" aria-labelledby="sc-trusted">
      <div className="pa-section-head">
        <h2 id="sc-trusted">
          <Icon name="shield" size={16} /> Trusted devices
        </h2>
        <button type="button" className="pa-btn pa-btn-outline" disabled={busy || state.phase !== "ready" || state.devices.length === 0} onClick={() => remove({ all: true })}>
          Remove all
        </button>
      </div>
      <p className="pa-hint">A trusted device skips the two-step code when you sign in. It stays trusted until you remove it or change your password.</p>
      {state.phase === "loading" && (
        <p className="pa-muted" role="status" aria-busy="true">
          Loading your trusted devices…
        </p>
      )}
      {state.phase === "error" && (
        <p className="pa-muted" role="alert">
          We could not load your trusted devices. Nothing was changed. Please reload the page.
        </p>
      )}
      {state.phase === "ready" && state.devices.length === 0 && <p className="pa-muted">No trusted devices.</p>}
      {state.phase === "ready" && state.devices.length > 0 && (
        <ul className="pa-sessions" aria-label="Trusted devices">
          {state.devices.map((d) => (
            <li className="pa-session" key={d.id}>
              <span className="pa-session-text">
                <span className="pa-row-label">{d.label}</span>
                <span className="pa-hint">Last used {new Date(d.lastUsed).toLocaleString()}</span>
              </span>
              <button type="button" className="pa-btn pa-btn-outline" disabled={busy} onClick={() => remove({ id: d.id })}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type Prefs = { newSignInAlert: boolean; thirdPartyAlert: boolean; newsletter: boolean };
type PrefsState = { phase: "loading" } | { phase: "error" } | { phase: "ready"; prefs: Prefs };
const PREF_ROWS: { key: keyof Prefs; label: string; hint: string; icon: IconName }[] = [
  { key: "newsletter", icon: "megaphone", label: "Offers and announcements", hint: "Product tips, special offers and important news from Platterly, sent weekly or monthly. Every email has an unsubscribe link." },
  { key: "newSignInAlert", icon: "monitor", label: "New sign-in to account alert", hint: "An email when your account is signed in to from a browser or system we have not seen before." },
  { key: "thirdPartyAlert", icon: "users", label: "Third-party app access alert", hint: "An email when another app is given access to your account. Apps cannot be connected yet, so nothing is sent for now." },
];
// On for everyone and cannot be switched off.
const ALWAYS_ON: { id: string; icon: IconName; label: string; hint: string }[] = [
  { id: "account", icon: "mail", label: "Account updates", hint: "Security alerts, password changes and important account activity." },
  { id: "billing", icon: "card", label: "Billing and payments", hint: "Invoices, payment confirmations, renewal reminders and billing updates." },
  { id: "product", icon: "layers", label: "Product updates", hint: "New features, improvements and product announcements." },
];

/** Optional account notices with an on/off switch each (AJ, 2026-11-10). Security, ownership and billing notices are always sent; product notices are set in each product. */
export function NotificationsView() {
  const [state, setState] = useState<PrefsState>({ phase: "loading" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/account/notifications", { cache: "no-store", credentials: "same-origin" });
        if (!alive) return;
        if (!res.ok) return setState({ phase: "error" });
        const body = (await res.json()) as { preferences?: Prefs };
        if (alive) setState(body.preferences ? { phase: "ready", prefs: body.preferences } : { phase: "error" });
      } catch {
        if (alive) setState({ phase: "error" });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function change(key: keyof Prefs, value: boolean) {
    // Shown at once; the server's answer replaces it, and a failed save shows the error line instead.
    if (state.phase === "ready") setState({ phase: "ready", prefs: { ...state.prefs, [key]: value } });
    setBusy(true);
    try {
      const res = await fetch("/api/account/notifications", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ [key]: value }) });
      const body = (await res.json().catch(() => ({}))) as { preferences?: Prefs };
      if (res.ok && body.preferences) setState({ phase: "ready", prefs: body.preferences });
      else setState({ phase: "error" });
    } catch {
      setState({ phase: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AccountShell>
      <PageHeader title="Notifications" lede="Choose what updates you'd like to receive from Platterly." />
      <DataGate>
        {(overview) => (
          <div className="pa-detail-grid">
            <section className="pa-card pa-form pa-list-rows" aria-labelledby="nt-optional">
              <h2 id="nt-optional" className="pa-visually-hidden">Account emails</h2>
              {state.phase === "loading" && (
                <p className="pa-muted" role="status" aria-busy="true">
                  Loading your choices…
                </p>
              )}
              {state.phase === "error" && (
                <p className="pa-muted" role="alert">
                  We could not load or save your choices. Please reload the page.
                </p>
              )}
              {state.phase === "ready" &&
                ALWAYS_ON.map((row) => (
                  <div className="pa-switch-row pa-setting-row" key={row.id}>
                    <span className="pa-detail-tile"><Icon name={row.icon} size={22} /></span>
                    <div>
                      <span className="pa-row-label" id={`pref-${row.id}`}>
                        {row.label}
                      </span>
                      <span className="pa-hint">{row.hint} Always on.</span>
                    </div>
                    <input type="checkbox" role="switch" className="pa-switch" aria-labelledby={`pref-${row.id}`} checked disabled readOnly />
                  </div>
                ))}
              {state.phase === "ready" &&
                PREF_ROWS.map((row) => (
                  <div className="pa-switch-row pa-setting-row" key={row.key}>
                    <span className="pa-detail-tile"><Icon name={row.icon} size={22} /></span>
                    <div>
                      <span className="pa-row-label" id={`pref-${row.key}`}>
                        {row.label}
                      </span>
                      <span className="pa-hint">{row.hint}</span>
                    </div>
                    <input type="checkbox" role="switch" className="pa-switch" aria-labelledby={`pref-${row.key}`} checked={state.prefs[row.key]} onChange={(e) => change(row.key, e.target.checked)} />
                  </div>
                ))}
              <p className="pa-hint pa-list-rows-note">Security, ownership and billing emails are always sent, and notices from a product are set inside that product.</p>
            </section>
            <div className="pa-stack pa-detail-side">
              <section className="pa-card pa-side-green" aria-label="Notification channels">
                <div className="pa-bd-side-head">
                  <span className="pa-detail-tile pa-green-tile"><Icon name="bell" size={22} /></span>
                  <h2>Notification channels</h2>
                </div>
                <p>We&apos;ll send these updates to your registered email:</p>
                <p className="pa-channel-email"><Icon name="mail" size={16} /> {overview.user.email}</p>
                <p>You can change your email from <Link href="/security">Security</Link>.</p>
              </section>
            </div>
          </div>
        )}
      </DataGate>
    </AccountShell>
  );
}

export function DevicesView() {
  return (
    <AccountShell>
      <PageHeader title="Devices" lede="Manage the devices where you're signed in to your Platterly account." />
      <DataGate>
        {() => (
          <>
            <div className="pa-detail-grid">
              <Devices />
              <div className="pa-stack pa-detail-side">
                <section className="pa-card pa-bd-secure" aria-label="About device access">
                  <span className="pa-detail-tile pa-bd-secure-tile"><Icon name="laptop" size={28} /></span>
                  <h2>About device access</h2>
                  <p className="pa-hint">See the devices that are signed in to your Platterly account and sign out of any you don&apos;t recognise.</p>
                </section>
              </div>
            </div>
            <TrustedDevices />
            <SignInHistory />
          </>
        )}
      </DataGate>
    </AccountShell>
  );
}

export function SecurityView() {
  return (
    <AccountShell>
      <PageHeader title="Security" lede="Keep your account safe and secure." />
      <DataGate>
        {(overview) => (
          <div className="pa-detail-grid">
            <section className="pa-card pa-form pa-list-rows" aria-label="Sign-in and security">
              <div className="pa-switch-row pa-setting-row">
                <span className="pa-detail-tile"><Icon name="mail" size={22} /></span>
                <div>
                  <span className="pa-row-label">Email</span>
                  <span className="pa-hint">{overview.user.email}</span>
                </div>
                {overview.user.emailVerified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Not verified</Badge>}
              </div>
              <ChangeEmail />
              <ChangePassword />
              <TwoFactor />
              <RecoveryEmail />
              <div className="pa-switch-row pa-setting-row">
                <span className="pa-detail-tile"><Icon name="key" size={22} /></span>
                <div>
                  <span className="pa-row-label">Account access</span>
                  <span className="pa-hint">Manage your active sessions and devices.</span>
                </div>
                <Link href="/devices" className="pa-btn pa-btn-outline">
                  Manage devices <Icon name="arrowRight" size={16} />
                </Link>
              </div>
            </section>
            <div className="pa-stack pa-detail-side">
              <section className="pa-card pa-bd-secure" aria-label="Tips for a secure account">
                <div className="pa-bd-side-head">
                  <span className="pa-detail-tile pa-bd-secure-tile"><Icon name="shieldCheck" size={26} /></span>
                  <h2>Tips for a secure account</h2>
                </div>
                <ul className="pa-bd-checks">
                  <li><Icon name="check" size={18} /> Use a strong, unique password.</li>
                  <li><Icon name="check" size={18} /> Enable two-step verification (2FA).</li>
                  <li><Icon name="check" size={18} /> Review your signed-in devices regularly.</li>
                </ul>
              </section>
            </div>
          </div>
        )}
      </DataGate>
    </AccountShell>
  );
}
