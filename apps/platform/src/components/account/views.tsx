"use client";

import Link from "next/link";
import { initials } from "@/lib/account/catalogue";
import { selectedProduct } from "@/lib/account/state";
import { CaterlyCard, RivoCard, TeamCard } from "./cards";
import { BusinessGate, DataGate } from "./data";
import { Icon } from "./icons";
import { AccountShell } from "./shell";
import { useAccount } from "./store";
import { useEffect, useState } from "react";
import { DataRights } from "./data-rights";
import { RecoveryEmail } from "./recovery-email";
import { TwoFactor } from "./two-factor";
import { ChangeEmail } from "./change-email";
import { ChangePassword } from "./change-password";
import { BillingSummary } from "./billing-views";
import { SignInHistory } from "./sign-in-history";
import { ProfileDetails } from "./profile-details";
import { Avatar, Badge, PageHeader } from "./ui";

export function OverviewView() {
  const account = useAccount();
  const product = selectedProduct(account);

  return (
    <AccountShell>
      <PageHeader title="Welcome back" lede="Your Platterly products, in one place." />
      <DataGate>
        {(overview) => (
          <>
            <section aria-labelledby="ov-profile" className="pa-narrow">
              <div className="pa-section-head">
                <h2 id="ov-profile">Your profile</h2>
                <Link href="/profile" className="pa-link">
                  View <Icon name="chevronRight" size={14} />
                </Link>
              </div>
              <div className="pa-card pa-profile-sum">
                <Avatar label={initials(overview.user.name ?? overview.user.email)} size="lg" round />
                <div>
                  <h3>{overview.user.name ?? overview.user.email}</h3>
                  <p className="pa-line">
                    <Icon name="mail" size={14} /> {overview.user.emailVerified ? "Email verified" : "Email not verified"}
                  </p>
                  <p className="pa-line">
                    <Icon name="phone" size={14} /> Name and phone are not stored yet
                  </p>
                </div>
              </div>
            </section>

            <section aria-labelledby="ov-products">
              <div className="pa-section-head">
                <h2 id="ov-products">My Products</h2>
                <Link href="/products" className="pa-link">
                  All products <Icon name="chevronRight" size={14} />
                </Link>
              </div>
              <BusinessGate overview={overview}>
                {(b) => (
                  <div className="pa-grid-2">
                    <CaterlyCard business={b.business} link={b.products.caterly} selected={product.id === "caterly"} />
                    <RivoCard selected={product.id === "rivo"} />
                  </div>
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
  const account = useAccount();
  const product = selectedProduct(account);
  return (
    <AccountShell>
      <PageHeader title="My Products" lede={`Products available to your business. Use the switcher in the sidebar to choose the product you are working in. Now: ${product.name}.`} />
      <DataGate>
        {(overview) => (
          <BusinessGate overview={overview}>
            {(b) => (
              <>
                <div className="pa-grid-2">
                  <CaterlyCard business={b.business} link={b.products.caterly} selected={product.id === "caterly"} />
                  <RivoCard selected={product.id === "rivo"} />
                </div>
                {b.products.caterly !== "none" ? <TeamCard product="Caterly" team={b.team} /> : null}
              </>
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
      <PageHeader title="My Profile" lede="Your personal details and account settings. They apply to every business and product." />
      <DataGate>
        {() => (
          <>
            <ProfileDetails />

            <DataRights />

            <section className="pa-card pa-form" aria-labelledby="pf-security">
              <div className="pa-section-head">
                <h2 id="pf-security">
                  <Icon name="shield" size={16} /> Security
                </h2>
              </div>
              <div className="pa-switch-row">
                <div>
                  <span className="pa-row-label">Password, two-step verification and signed-in devices</span>
                  <span className="pa-hint">These settings have their own page.</span>
                </div>
                <Link href="/security" className="pa-btn pa-btn-outline">
                  Open Security
                </Link>
              </div>
            </section>
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
        <h2 id="sc-devices">
          <Icon name="shield" size={16} /> Signed-in devices
        </h2>
        <button type="button" className="pa-btn pa-btn-outline" disabled={busy || state.phase !== "ready"} onClick={() => revoke({ all: true })}>
          <Icon name="logout" size={15} /> Sign out everywhere
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
            <li className="pa-session" key={d.id}>
              <span className="pa-session-text">
                <span className="pa-row-label">{d.label}</span>
                <span className="pa-hint">Last active {new Date(d.lastActive).toLocaleString()}</span>
              </span>
              {d.current ? (
                <Badge tone="success">This device</Badge>
              ) : (
                <button type="button" className="pa-btn pa-btn-outline" disabled={busy} onClick={() => revoke({ id: d.id })}>
                  Sign out
                </button>
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
const PREF_ROWS: { key: keyof Prefs; label: string; hint: string }[] = [
  { key: "newSignInAlert", label: "New sign-in to account alert", hint: "An email when your account is signed in to from a browser or system we have not seen before." },
  { key: "thirdPartyAlert", label: "Third-party app access alert", hint: "An email when another app is given access to your account. Apps cannot be connected yet, so nothing is sent for now." },
  { key: "newsletter", label: "Newsletter subscription", hint: "Product news and tips from Platterly." },
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
      <PageHeader title="Notifications" lede="Choose which optional emails you get about your Platterly account." />
      <DataGate>
        {() => (
          <section className="pa-card pa-form" aria-labelledby="nt-optional">
            <div className="pa-section-head">
              <h2 id="nt-optional">
                <Icon name="bell" size={16} /> Account emails
              </h2>
            </div>
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
              PREF_ROWS.map((row) => (
                <div className="pa-switch-row" key={row.key}>
                  <div>
                    <span className="pa-row-label" id={`pref-${row.key}`}>
                      {row.label}
                    </span>
                    <span className="pa-hint">{row.hint}</span>
                  </div>
                  <input type="checkbox" role="switch" aria-labelledby={`pref-${row.key}`} checked={state.prefs[row.key]} onChange={(e) => change(row.key, e.target.checked)} />
                </div>
              ))}
            {state.phase === "ready" && (
              <div className="pa-switch-row">
                <div>
                  <span className="pa-row-label" id="pref-security">
                    Security alerts
                  </span>
                  <span className="pa-hint">Always on. We email you about changes to your sign-in details, two-step verification and deletion requests.</span>
                </div>
                <input type="checkbox" role="switch" aria-labelledby="pref-security" checked disabled readOnly />
              </div>
            )}
            <p className="pa-hint">Security, ownership and billing emails are always sent, and notices from a product are set inside that product.</p>
          </section>
        )}
      </DataGate>
    </AccountShell>
  );
}

export function DevicesView() {
  return (
    <AccountShell>
      <PageHeader title="Devices and activity" lede="Where you are signed in, which devices skip the two-step code, and your recent sign-ins." />
      <DataGate>
        {() => (
          <>
            <Devices />
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
      <PageHeader title="Security" lede="How you sign in to Platterly: email, password, two-step verification and recovery. These settings apply to every business and product." />
      <DataGate>
        {(overview) => (
          <>
            <section className="pa-card pa-form" aria-labelledby="sc-signin">
              <div className="pa-section-head">
                <h2 id="sc-signin">
                  <Icon name="lock" size={16} /> Sign-in
                </h2>
              </div>
              <div className="pa-switch-row">
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
            </section>
          </>
        )}
      </DataGate>
    </AccountShell>
  );
}

