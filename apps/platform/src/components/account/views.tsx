"use client";

import Link from "next/link";
import { useState } from "react";
import { BUSINESS, initials, LANGUAGES, MOCK_USER, SAMPLE_DEVICES, TIMEZONES, type Profile } from "@/lib/account/mock-data";
import { selectedProduct } from "@/lib/account/state";
import { BusinessCard, CaterlyCard, RivoCard } from "./cards";
import { Icon } from "./icons";
import { AccountShell } from "./shell";
import { dispatch, useAccount } from "./store";
import { Avatar, Badge, PageHeader, PlaceholderNote } from "./ui";

export function OverviewView() {
  const account = useAccount();
  const product = selectedProduct(account);
  const { profile } = account;

  return (
    <AccountShell>
      <PageHeader title={`Welcome back, ${MOCK_USER.firstName}`} lede="Your Platterly products, in one place." />

      <section aria-labelledby="ov-profile" className="pa-narrow">
        <div className="pa-section-head">
          <h2 id="ov-profile">Your profile</h2>
          <Link href="/profile" className="pa-link">
            Edit <Icon name="chevronRight" size={14} />
          </Link>
        </div>
        <div className="pa-card pa-profile-sum">
          <Avatar label={initials(profile.fullName)} size="lg" round />
          <div>
            <h3>{profile.fullName}</h3>
            <p className="pa-line">
              <Icon name="mail" size={14} /> {profile.email}
            </p>
            <p className="pa-line">
              <Icon name="phone" size={14} /> {profile.phone}
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
        <div className="pa-grid-2">
          <CaterlyCard business={BUSINESS} link={account.caterly} selected={product.id === "caterly"} />
          <RivoCard selected={product.id === "rivo"} />
        </div>
      </section>
    </AccountShell>
  );
}

export function BusinessView() {
  const account = useAccount();
  return (
    <AccountShell>
      <PageHeader title="My Business" lede="The business behind your Platterly account. Each sign-in has one business." />
      <PlaceholderNote>The business, its status and your role are invented sample data. No business exists behind this page yet.</PlaceholderNote>
      <div className="pa-business-wrap">
        <BusinessCard business={BUSINESS} link={account.caterly} />
      </div>
      <p className="pa-foot-note">One sign-in holds one business. A second kitchen needs another email address. Editing business details and handing the Admin role to someone else will be added here. They are not part of this prototype.</p>
    </AccountShell>
  );
}

export function ProductsView() {
  const account = useAccount();
  const product = selectedProduct(account);
  return (
    <AccountShell>
      <PageHeader title="My Products" lede={`Products available to ${BUSINESS.name}. Use the switcher in the sidebar to choose the product you are working in. Now: ${product.name}.`} />
      <div className="pa-grid-2">
        <CaterlyCard business={BUSINESS} link={account.caterly} selected={product.id === "caterly"} />
        <RivoCard selected={product.id === "rivo"} />
      </div>
    </AccountShell>
  );
}

function Field({ id, label, value, editing, onChange, hint, readOnly, options }: { id: string; label: string; value: string; editing: boolean; onChange?: (v: string) => void; hint?: string; readOnly?: boolean; options?: string[] }) {
  const locked = !editing || readOnly;
  return (
    <div className="pa-field">
      <label htmlFor={id}>{label}</label>
      {options ? (
        <select id={id} value={value} disabled={locked} onChange={(e) => onChange?.(e.target.value)}>
          {options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input id={id} value={value} disabled={locked} onChange={(e) => onChange?.(e.target.value)} />
      )}
      {hint && <span className="pa-hint">{hint}</span>}
    </div>
  );
}

function Switch({ id, label, hint, checked, disabled, onChange }: { id: string; label: string; hint: string; checked: boolean; disabled?: boolean; onChange?: (v: boolean) => void }) {
  return (
    <div className="pa-switch-row">
      <div>
        <label htmlFor={id}>{label}</label>
        <span className="pa-hint">{hint}</span>
      </div>
      <input id={id} type="checkbox" role="switch" className="pa-switch" checked={checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} />
    </div>
  );
}

export function ProfileView() {
  const account = useAccount();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Profile>(account.profile);
  const [saved, setSaved] = useState(false);
  const shown = editing ? draft : account.profile;
  const set = (key: keyof Profile) => (v: string) => setDraft((d) => ({ ...d, [key]: v }));

  const startEdit = () => {
    setDraft(account.profile);
    setSaved(false);
    setEditing(true);
  };
  const cancel = () => setEditing(false);
  const save = () => {
    dispatch({ type: "saveProfile", profile: { ...draft, fullName: draft.fullName.trim() || account.profile.fullName } });
    setEditing(false);
    setSaved(true);
  };

  return (
    <AccountShell>
      <PageHeader title="My Profile" lede="Your personal details and account settings. They apply to every business and product." />

      <section className="pa-card pa-profile-head" aria-label="Account holder">
        <Avatar label={initials(account.profile.fullName)} size="xl" round />
        <div className="pa-profile-head-text">
          <h2>{account.profile.fullName}</h2>
          <p className="pa-line">
            <Icon name="mail" size={14} /> {account.profile.email} <Badge tone="success">Verified</Badge>
          </p>
        </div>
      </section>

      <section className="pa-card pa-form" aria-labelledby="pf-personal">
        <div className="pa-section-head">
          <h2 id="pf-personal">Personal information</h2>
          {!editing && (
            <button type="button" className="pa-btn pa-btn-outline" onClick={startEdit}>
              <Icon name="pencil" size={15} /> Edit
            </button>
          )}
        </div>
        <div className="pa-form-grid">
          <Field id="pf-name" label="Full name" value={shown.fullName} editing={editing} onChange={set("fullName")} />
          <Field id="pf-email" label="Email" value={shown.email} editing={editing} readOnly hint="Changing your email will need a code sent to the new address. Not available in this prototype." />
          <Field id="pf-phone" label="Phone" value={shown.phone} editing={editing} onChange={set("phone")} />
          <Field id="pf-tz" label="Time zone" value={shown.timezone} editing={editing} onChange={set("timezone")} options={TIMEZONES} />
          <Field id="pf-lang" label="Language" value={shown.language} editing={editing} onChange={set("language")} options={LANGUAGES} />
        </div>
        {editing && (
          <div className="pa-form-foot">
            <button type="button" className="pa-btn pa-btn-outline" onClick={cancel}>
              Cancel
            </button>
            <button type="button" className="pa-btn pa-btn-primary" onClick={save}>
              Save changes
            </button>
          </div>
        )}
        {saved && !editing && (
          <p className="pa-saved" role="status">
            <Icon name="check" size={14} /> Saved in this browser tab only.
          </p>
        )}
      </section>

      <section className="pa-card pa-form" aria-labelledby="pf-prefs">
        <div className="pa-section-head">
          <h2 id="pf-prefs">
            <Icon name="bell" size={16} /> Notifications
          </h2>
        </div>
        <Switch id="pf-updates" label="Product updates" hint="News about new Platterly products and features." checked={account.productUpdates} onChange={(value) => dispatch({ type: "setProductUpdates", value })} />
        <Switch id="pf-alerts" label="Security alerts" hint="Always on. We email you about sign-ins and changes to your account." checked disabled />
      </section>

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
    </AccountShell>
  );
}

const SECURITY_ROWS = [
  { label: "Password", hint: "Change the password you use to sign in.", action: "Change password", state: "Not connected" },
  { label: "Two-step verification", hint: "Add a second check when you sign in.", action: "Set up", state: "Not set up (sample)" },
  { label: "Recovery email", hint: "Where we send a code if you are locked out.", action: "Change recovery email", state: "Not connected" },
];

export function SecurityView() {
  const account = useAccount();
  const [notice, setNotice] = useState("");
  const say = (what: string) => setNotice(`${what} is not connected yet. Nothing was changed.`);

  return (
    <AccountShell>
      <PageHeader title="Security" lede="How you sign in to Platterly and where you are signed in. These settings apply to every business and product." />
      <PlaceholderNote>This page shows the layout only. Sign-in is not built yet, so no password, verification or session can be changed, and the devices below are invented sample data.</PlaceholderNote>

      <section className="pa-card pa-form" aria-labelledby="sc-signin">
        <div className="pa-section-head">
          <h2 id="sc-signin">
            <Icon name="lock" size={16} /> Sign-in
          </h2>
        </div>
        <div className="pa-switch-row">
          <div>
            <span className="pa-row-label">Email</span>
            <span className="pa-hint">{account.profile.email}</span>
          </div>
          <Badge tone="success">Verified</Badge>
        </div>
        {SECURITY_ROWS.map((row) => (
          <div className="pa-switch-row" key={row.label}>
            <div>
              <span className="pa-row-label">{row.label}</span>
              <span className="pa-hint">{row.hint}</span>
            </div>
            <div className="pa-row-actions">
              <Badge tone="neutral">{row.state}</Badge>
              <button type="button" className="pa-btn pa-btn-outline" onClick={() => say(row.label)}>
                {row.action}
              </button>
            </div>
          </div>
        ))}
      </section>

      <section className="pa-card pa-form" aria-labelledby="sc-devices">
        <div className="pa-section-head">
          <h2 id="sc-devices">
            <Icon name="shield" size={16} /> Signed-in devices
          </h2>
          <button type="button" className="pa-btn pa-btn-outline" onClick={() => say("Signing out of all devices")}>
            <Icon name="logout" size={15} /> Sign out everywhere
          </button>
        </div>
        <ul className="pa-sessions" aria-label="Signed-in devices (sample)">
          {SAMPLE_DEVICES.map((d) => (
            <li className="pa-session" key={d.id}>
              <span className="pa-session-text">
                <span className="pa-row-label">{d.label}</span>
                <span className="pa-hint">{d.detail}</span>
              </span>
              {d.current ? (
                <Badge tone="success">This device</Badge>
              ) : (
                <button type="button" className="pa-btn pa-btn-outline" onClick={() => say(`Signing out ${d.label}`)}>
                  Sign out
                </button>
              )}
            </li>
          ))}
        </ul>
        {notice && (
          <p className="pa-saved pa-saved-muted" role="status">
            {notice}
          </p>
        )}
      </section>
    </AccountShell>
  );
}
