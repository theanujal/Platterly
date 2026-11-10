"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { isValidPhoneNumber } from "libphonenumber-js/max";
import { PhoneField } from "../phone-field";
import "../account/account.css";
import "./auth.css";
import { OAUTH_QUERY_HEADER } from "@/modules/auth/sign-up-gate";
import { useProductBrand } from "./brand";
import { ChefHatIcon, EyeIcon, EyeOffIcon, LockIcon, MailIcon, QrCodeIcon, ShieldCheckIcon, TrendingUpIcon, UserIcon, UtensilsCrossedIcon } from "./theme-icons";

// F4.1.1 / F4.1.2 pages on the auth host. They talk only to the identity provider's own endpoints (same origin, /api/auth/*). Messages are the same
// whether or not an address is registered (no enumeration), and never say more than "check your details" for a wrong password.
const PASSWORD_MIN = 8;
const OWN_PARAMS = ["email", "verified", "sent", "reset", "recovery"];

/** The provider's signed sign-in query (`sig`, `exp`, ...), without this page's own parameters, so it can be handed back to the provider unchanged. */
function providerQuery(params: URLSearchParams): string {
  const kept = new URLSearchParams(params);
  for (const own of OWN_PARAMS) kept.delete(own);
  return kept.toString();
}

async function post(path: string, body: unknown, extraHeaders: Record<string, string> = {}): Promise<{ status: number; code?: string; twoFactorRedirect?: boolean }> {
  try {
    const res = await fetch(`/api/auth${path}`, { method: "POST", headers: { "content-type": "application/json", ...extraHeaders }, credentials: "same-origin", body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as { code?: string; twoFactorRedirect?: boolean };
    return { status: res.status, code: json.code, twoFactorRedirect: json.twoFactorRedirect === true };
  } catch {
    return { status: 0 };
  }
}

/** False on the server and during the first render, true once the page is interactive. A form cannot be submitted before that. */
const noop = () => () => undefined;
const useHydrated = () => useSyncExternalStore(noop, () => true, () => false);

const GENERIC = "Something went wrong. Please try again in a moment.";
const BUSY = "Too many attempts. Please wait a minute and try again.";

const CATERLY_FEATURES = [
  { Icon: QrCodeIcon, label: "QR-code digital menus, ready in minutes" },
  { Icon: UtensilsCrossedIcon, label: "Real-time order & kitchen management" },
  { Icon: ShieldCheckIcon, label: "Multi-branch, multi-role access control" },
  { Icon: TrendingUpIcon, label: "Reporting that grows with your business" },
];

/** Caterly's own split-screen sign-in (orange brand panel, form beside it), so signing in through the central page looks like signing in to Caterly. */
function CaterlyShell({ title, lede, footer, children, hydrated, icon }: { title: string; lede?: string; footer?: ReactNode; children: ReactNode; hydrated: boolean; icon: string | null }) {
  return (
    <div className="pl-cat" data-hydrated={hydrated} data-theme="caterly">
      <aside className="pl-cat-panel">
        <div className="pl-cat-brand">
          <ChefHatIcon size={32} />
          <span>Caterly</span>
          <small>by Platterly</small>
        </div>
        <div className="pl-cat-pitch">
          <p className="pl-cat-headline">Run your catering business from one place</p>
          <p className="pl-cat-sub">From enquiry to payment — quotations, menus, kitchen, and billing, all in one dashboard built for Indian caterers.</p>
        </div>
        <ul className="pl-cat-features">
          {CATERLY_FEATURES.map(({ Icon, label }) => (
            <li key={label}>
              <span className="pl-cat-feature-icon">
                <Icon size={16} />
              </span>
              {label}
            </li>
          ))}
        </ul>
      </aside>
      <main className="pl-cat-main">
        <div className="pl-cat-col">
          <div className="pl-cat-head">
            {icon && (
              // eslint-disable-next-line @next/next/no-img-element -- Caterly's registered mark, only ever served from Caterly's own address
              <img className="pl-cat-mark" src={icon} alt="Caterly by Platterly" width={56} height={56} />
            )}
            <h1 id="auth-title">{title}</h1>
            {lede && <p className="pl-cat-lede">{lede}</p>}
          </div>
          {children}
          {footer && <p className="pl-cat-footer">{footer}</p>}
        </div>
      </main>
    </div>
  );
}

export function AuthCard({ title, lede, footer, children }: { title: string; lede?: string; footer?: ReactNode; children: ReactNode }) {
  const hydrated = useHydrated();
  const brand = useProductBrand();
  if (brand?.theme === "caterly")
    return (
      <CaterlyShell title={title} lede={lede} footer={footer} hydrated={hydrated} icon={brand.icon}>
        {children}
      </CaterlyShell>
    );
  return (
    <main className="pl-auth" data-hydrated={hydrated}>
      <div className="pl-auth-box">
        <div className="pl-auth-brand" data-product={brand ? "branded" : "platterly"}>
          {brand ? (
            <>
              {brand.icon ? (
                // eslint-disable-next-line @next/next/no-img-element -- a product's registered logo, only ever served from that product's own address
                <img className="pl-auth-logo" src={brand.icon} alt="" width={40} height={40} />
              ) : (
                <span className="pl-auth-logo pl-auth-logo-initial" aria-hidden="true">
                  {brand.name.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="pl-auth-product">{brand.name}</span>
            </>
          ) : (
            <>
              <span className="pa-brand-mark" aria-hidden="true">
                P
              </span>
              <span className="pa-brand-name">Platterly</span>
            </>
          )}
        </div>
        <section className="pl-auth-card" aria-labelledby="auth-title">
          <h1 id="auth-title">{title}</h1>
          {lede && <p className="pl-auth-lede">{lede}</p>}
          {children}
          {footer && <p className="pl-auth-links">{footer}</p>}
        </section>
        {brand && <p className="pl-auth-powered">Signing in with your Platterly account</p>}
      </div>
    </main>
  );
}

function Field({ id, label, type = "text", value, onChange, autoComplete, inputMode, maxLength, hint, star, user }: { star?: boolean; user?: boolean; id: string; label: string; type?: string; value: string; onChange: (v: string) => void; autoComplete?: string; inputMode?: "numeric" | "email"; maxLength?: number; hint?: string }) {
  const themed = useProductBrand()?.theme === "caterly";
  const [shown, setShown] = useState(false);
  const icon = themed && (type === "email" || type === "password" || user);
  const input = <input id={id} name={id} type={type === "password" && shown ? "text" : type} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} inputMode={inputMode} maxLength={maxLength} required />;
  return (
    <div className="pa-field">
      <label htmlFor={id} className={star ? "pl-req" : undefined}>
        {label}
      </label>
      {icon ? (
        <div className="pl-cat-input">
          <span className="pl-cat-input-icon">{user ? <UserIcon /> : type === "email" ? <MailIcon /> : <LockIcon />}</span>
          {input}
          {type === "password" && (
            <button type="button" className="pl-cat-reveal" onClick={() => setShown((v) => !v)} aria-pressed={shown} aria-label={shown ? "Hide text" : "Show text"}>
              {shown ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          )}
        </div>
      ) : (
        input
      )}
      {hint && <span className="pa-hint">{hint}</span>}
    </div>
  );
}

const Error_ = ({ children }: { children: ReactNode }) => (
  <p className="pl-auth-error" role="alert">
    {children}
  </p>
);

function useQuery() {
  const params = useSearchParams();
  return { params, carry: providerQuery(params), email: params.get("email") ?? "" };
}
const withCarry = (path: string, carry: string, extra: Record<string, string> = {}) => {
  const q = new URLSearchParams(carry);
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  const s = q.toString();
  return s ? `${path}?${s}` : path;
};

export function SignInForm() {
  const brand = useProductBrand();
  const themed = brand?.theme === "caterly";
  const hydrated = useHydrated();
  const { params, carry, email: preset } = useQuery();
  const [email, setEmail] = useState(preset);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  // Two-step verification: after a right password, a person who has it is asked for a code before any session exists.
  const [step, setStep] = useState<"password" | "code">("password");
  const [code, setCode] = useState("");
  const [useBackup, setUseBackup] = useState(false);
  const [trust, setTrust] = useState(false);

  function finish() {
    // Came from the Account: hand the signed query back to the provider, which finishes the code flow. Came directly: just say so.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full navigation to the provider's API route, not a Next page
    if (carry.includes("sig=")) window.location.assign(`/api/auth/oauth2/authorize?${carry}`);
    else setDone(true);
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await post(useBackup ? "/two-factor/verify-backup-code" : "/two-factor/verify-totp", { code: code.trim(), trustDevice: trust });
    setBusy(false);
    if (res.status === 200) return finish();
    if (res.status === 429) return setError(BUSY);
    if (res.status === 403 && res.code === "ACCOUNT_ON_HOLD") return setError("Your account is under review. We are verifying that it is really you. Please contact Platterly support.");
    // A lost or expired first step (the short-lived cookie is gone): start over from the password.
    if (res.status === 401 && res.code === "INVALID_TWO_FACTOR_COOKIE") {
      setStep("password");
      setPassword("");
      return setError("Your sign-in timed out. Please sign in again.");
    }
    setError(res.status === 401 || res.status === 400 ? (useBackup ? "That backup code is not right, or it was already used." : "That code is not right. Check the code in your authenticator app.") : GENERIC);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await post("/sign-in/email", { email, password });
    setBusy(false);
    if (res.status === 200 && res.twoFactorRedirect) {
      setStep("code");
      return;
    }
    if (res.status === 200) return finish();
    if (res.status === 403 && res.code === "EMAIL_NOT_VERIFIED") {
      // The provider sends no code on a refused sign-in, and someone who never got one (an imported person) would otherwise wait for nothing. Ask for a fresh
      // one first; if it is held back by the resend limit, the code from the last minute is still valid, so the page's message stays true.
      await post("/email-otp/send-verification-otp", { email, type: "email-verification" }).catch(() => null);
      return void window.location.assign(withCarry("/verify", carry, { email, sent: "1" }));
    }
    if (res.status === 403 && res.code === "ACCOUNT_ON_HOLD") return setError("Your account is under review. We are verifying that it is really you. Please contact Platterly support.");
    setError(res.status === 429 ? BUSY : res.status === 401 || res.status === 400 ? "The email or password is not right. Check them and try again." : GENERIC);
  }

  if (done)
    return (
      <AuthCard title="You are signed in" lede="You can close this page, or go to your Account.">
        <a className="pa-btn pa-btn-primary" href={`${window.location.protocol}//${window.location.host.replace(/^auth\./, "account.")}/auth/start`}>
          Go to my Account
        </a>
      </AuthCard>
    );
  if (step === "code")
    return (
      <AuthCard title="Two-step verification" lede={useBackup ? "Enter one of your backup codes." : "Enter the 6-digit code from your authenticator app."}>
        <form className="pl-auth-form" method="post" onSubmit={submitCode}>
          {error && <Error_>{error}</Error_>}
          <Field id="code" label={useBackup ? "Backup code" : "Authentication code"} value={code} onChange={setCode} autoComplete="one-time-code" inputMode={useBackup ? undefined : "numeric"} maxLength={useBackup ? 24 : 6} />
          <div className="pl-terms">
            <input id="trust" type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} />
            <label htmlFor="trust">Trust this device (until I remove it or change my password)</label>
          </div>
          <button type="submit" className="pa-btn pa-btn-primary" disabled={busy || !hydrated}>
            {busy ? "Checking…" : "Verify and sign in"}
          </button>
        </form>
        <p className="pl-auth-links">
          <button type="button" className="pa-link" onClick={() => (setUseBackup(!useBackup), setCode(""), setError(""))}>
            {useBackup ? "Use my authenticator app" : "Use a backup code"}
          </button>
        </p>
      </AuthCard>
    );
  return (
    <AuthCard
      title={themed ? "Welcome back" : brand ? `Sign in to ${brand.name}` : "Sign in"}
      lede={themed ? "Sign in to manage your catering business" : "Use your Platterly account."}
      footer={
        themed ? (
          <>
            New to Platterly? <Link href={withCarry("/sign-up", carry)}>Create an account</Link>
          </>
        ) : undefined
      }
    >
      <form className="pl-auth-form" method="post" onSubmit={submit}>
        {params.get("verified") && <p className="pl-auth-ok">Your email is verified. You can sign in now.</p>}
        {params.get("reset") && <p className="pl-auth-ok">Your password was changed. Sign in with the new one.</p>}
        {error && <Error_>{error}</Error_>}
        <Field id="email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" inputMode="email" />
        <Field id="password" label="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
        {themed && (
          <Link className="pl-cat-forgot" href={withCarry("/forgot", carry)}>
            Forgot password?
          </Link>
        )}
        <button type="submit" className="pa-btn pa-btn-primary" disabled={busy || !hydrated}>
          {busy ? "Signing in…" : themed ? "Sign in to your account" : "Sign in"}
        </button>
      </form>
      {!themed && (
        <p className="pl-auth-links">
          <Link href={withCarry("/forgot", carry)}>Forgot your password?</Link>
          {brand ? <Link href={withCarry("/sign-up", carry)}>Create an account</Link> : <span>Accounts are created when you first use a Platterly product.</span>}
        </p>
      )}
    </AuthCard>
  );
}

/** Shown instead of the sign-up form when the person did not start from a product (they came from the Account or the Store, or typed the address). */
export function SignUpClosed() {
  return (
    <AuthCard title="Create your account from a product" lede="Platterly accounts are created when you first sign up to one of our products, such as Caterly. Open the product and choose Create an account there.">
      <p className="pl-auth-links">
        <Link href="/sign-in">Already have an account? Sign in</Link>
      </p>
    </AuthCard>
  );
}

export function SignUpForm({ termsUrl, privacyUrl }: { termsUrl: string; privacyUrl: string }) {
  const themed = useProductBrand()?.theme === "caterly";
  const hydrated = useHydrated();
  const { params, carry } = useQuery();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!firstName.trim() || !lastName.trim()) return setError("Enter your first and last name.");
    if (!phone || !isValidPhoneNumber(phone)) return setError("Enter a valid phone number.");
    if (password.length < PASSWORD_MIN) return setError(`Choose a password of at least ${PASSWORD_MIN} characters.`);
    if (password !== confirm) return setError("The two passwords do not match.");
    if (!accepted) return setError("Please accept the Terms and Conditions and the Privacy Policy to continue.");
    setBusy(true);
    const first = firstName.trim();
    const last = lastName.trim();
    const res = await post("/sign-up/email", { name: `${first} ${last}`, firstName: first, lastName: last, phone, email, password }, { [OAUTH_QUERY_HEADER]: window.location.search.replace(/^\?/, "") });
    setBusy(false);
    if (res.status === 200) return void window.location.assign(withCarry("/verify", carry, { email, sent: "1" }));
    setError(res.status === 429 ? BUSY : res.status === 400 || res.status === 422 ? "Check your details: your name, a valid phone number and email, and a password of at least 8 characters." : GENERIC);
  }

  return (
    <AuthCard
      title="Create your account"
      lede={themed ? "Start your free 7-day trial" : "One account for every Platterly product."}
      footer={
        themed ? (
          <>
            Already have an account? <Link href={withCarry("/sign-in", carry)}>Sign in</Link>
          </>
        ) : undefined
      }
    >
      <form className="pl-auth-form" method="post" onSubmit={submit}>
        {error && <Error_>{error}</Error_>}
        <div className="pl-name-row">
          <Field id="firstName" label="First name" value={firstName} onChange={setFirstName} autoComplete="given-name" maxLength={40} star user />
          <Field id="lastName" label="Last name" value={lastName} onChange={setLastName} autoComplete="family-name" maxLength={40} star user />
        </div>
        <Field id="email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" inputMode="email" star />
        <div className="pa-field">
          <label htmlFor="phone" className="pl-req">
            Phone
          </label>
          <PhoneField id="phone" value={phone} onChange={setPhone} />
        </div>
        <Field id="password" label="Password" type="password" value={password} onChange={setPassword} autoComplete="new-password" hint={`At least ${PASSWORD_MIN} characters.`} star />
        <Field id="confirmPassword" label="Confirm password" type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" star />
        <div className="pl-terms">
          <input id="terms" type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
          <label htmlFor="terms">
            I accept the{" "}
            <a href={termsUrl} target="_blank" rel="noopener noreferrer">
              Terms and Conditions
            </a>{" "}
            and{" "}
            <a href={privacyUrl} target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </a>
          </label>
        </div>
        <button type="submit" className="pa-btn pa-btn-primary" disabled={busy || !hydrated}>
          {busy ? "Creating…" : "Create account"}
        </button>
      </form>
      {!themed && (
        <p className="pl-auth-links">
          <span className="pa-muted">Already have an account?</span>
          <Link href={withCarry("/sign-in", carry)}>Sign in</Link>
        </p>
      )}
    </AuthCard>
  );
}

const RESEND_SECONDS = 55;

function useCountdown(start: number) {
  const [left, setLeft] = useState(start);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return [left, setLeft] as const;
}

export function VerifyForm() {
  const hydrated = useHydrated();
  const { params, carry, email } = useQuery();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState(params.get("sent") ? "We sent a 6-digit code to your email. It expires in 10 minutes." : "");
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useCountdown(params.get("sent") ? RESEND_SECONDS : 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await post("/email-otp/verify-email", { email, otp: code.trim() });
    setBusy(false);
    if (res.status === 200) return void window.location.assign(withCarry("/sign-in", carry, { email, verified: "1" }));
    setError(res.status === 429 ? BUSY : res.status === 400 ? "That code is not right or has expired. Check it, or ask for a new one." : GENERIC);
  }

  async function resend() {
    setError("");
    const res = await post("/email-otp/send-verification-otp", { email, type: "email-verification" });
    if (res.status === 200) {
      setNote("If that address is waiting for verification, a new code is on its way.");
      setLeft(RESEND_SECONDS);
    } else setError(res.status === 429 ? BUSY : GENERIC);
  }

  return (
    <AuthCard title="Check your email" lede={email ? `Enter the code we sent to ${email}.` : "Enter the code we sent to your email."}>
      <form className="pl-auth-form" method="post" onSubmit={submit}>
        {note && <p className="pl-auth-ok">{note}</p>}
        {error && <Error_>{error}</Error_>}
        <div className="pl-auth-code">
          <Field id="code" label="Verification code" value={code} onChange={(v) => setCode(v.replace(/\D/g, ""))} autoComplete="one-time-code" inputMode="numeric" maxLength={6} />
        </div>
        <button type="submit" className="pa-btn pa-btn-primary" disabled={busy || !hydrated || code.length !== 6 || !email}>
          {busy ? "Checking…" : "Verify email"}
        </button>
      </form>
      <p className="pl-auth-links">
        <button type="button" className="pl-auth-link-btn" onClick={resend} disabled={left > 0 || !email}>
          {left > 0 ? `Resend code in ${left}s` : "Resend code"}
        </button>
        <Link href={withCarry("/sign-in", carry)}>Back to sign in</Link>
      </p>
    </AuthCard>
  );
}

export function ForgotForm() {
  const hydrated = useHydrated();
  const { carry } = useQuery();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await post("/email-otp/send-verification-otp", { email, type: "forget-password" });
    setBusy(false);
    // The same next page whether or not the address is registered.
    if (res.status === 200) return void window.location.assign(withCarry("/reset", carry, { email, sent: "1" }));
    setError(res.status === 429 ? BUSY : GENERIC);
  }

  // "I cannot reach this email": send the same reset code to the person's recovery email, if they set one. The answer and the next page are the same either way.
  async function viaRecovery() {
    if (!email.trim()) return setError("Enter your email first.");
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/recovery/send", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ email }) });
      if (res.ok) return void window.location.assign(withCarry("/reset", carry, { email, sent: "1", recovery: "1" }));
      setError(res.status === 429 ? BUSY : GENERIC);
    } catch {
      setError(GENERIC);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Reset your password" lede="Enter your email and we will send you a code.">
      <form className="pl-auth-form" method="post" onSubmit={submit}>
        {error && <Error_>{error}</Error_>}
        <Field id="email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" inputMode="email" />
        <button type="submit" className="pa-btn pa-btn-primary" disabled={busy || !hydrated}>
          {busy ? "Sending…" : "Send code"}
        </button>
      </form>
      <p className="pl-auth-links">
        <button type="button" className="pa-link" disabled={busy || !hydrated} onClick={viaRecovery}>
          I cannot reach this email: use my recovery email
        </button>
        <Link href={withCarry("/sign-in", carry)}>Back to sign in</Link>
      </p>
    </AuthCard>
  );
}

export function ResetForm() {
  const hydrated = useHydrated();
  const { params, carry, email: preset } = useQuery();
  const [email, setEmail] = useState(preset);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < PASSWORD_MIN) return setError(`Choose a password of at least ${PASSWORD_MIN} characters.`);
    setBusy(true);
    const res = await post("/email-otp/reset-password", { email, otp: code.trim(), password });
    setBusy(false);
    if (res.status === 200) return void window.location.assign(withCarry("/sign-in", carry, { email, reset: "1" }));
    setError(res.status === 429 ? BUSY : res.status === 400 ? "That code is not right or has expired. Check it, or start again." : GENERIC);
  }

  return (
    <AuthCard title="Choose a new password" lede="Enter the code we emailed you and your new password. Other devices will be signed out.">
      <form className="pl-auth-form" method="post" onSubmit={submit}>
        {params.get("sent") && <p className="pl-auth-ok">{params.get("recovery") ? "If that account has a recovery email, a code is on its way to it." : "If that address has an account, a code is on its way."}</p>}
        {error && <Error_>{error}</Error_>}
        <Field id="email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" inputMode="email" />
        <div className="pl-auth-code">
          <Field id="code" label="Code" value={code} onChange={(v) => setCode(v.replace(/\D/g, ""))} autoComplete="one-time-code" inputMode="numeric" maxLength={6} />
        </div>
        <Field id="password" label="New password" type="password" value={password} onChange={setPassword} autoComplete="new-password" hint={`At least ${PASSWORD_MIN} characters.`} />
        <button type="submit" className="pa-btn pa-btn-primary" disabled={busy || !hydrated || code.length !== 6}>
          {busy ? "Saving…" : "Change password"}
        </button>
      </form>
      <p className="pl-auth-links">
        <Link href={withCarry("/forgot", carry)}>Send a new code</Link>
        <Link href={withCarry("/sign-in", carry)}>Back to sign in</Link>
      </p>
    </AuthCard>
  );
}
