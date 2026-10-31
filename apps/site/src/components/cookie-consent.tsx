"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { SiteScript } from "@/lib/content";

/**
 * The cookie notice and the scripts it controls. The scripts come from Platterly Ops (Website, Scripts) as plain text. An Essential
 * script runs at once; an Analytics or Marketing script runs only after the visitor accepts that kind, so declining, or never
 * answering, runs nothing of that kind. The choice is kept on the visitor's device, as the Cookie Policy says, and "Cookie settings"
 * in the footer asks again. Nothing here knows which tool a script is for: the notice, the cookies to remove and the place on the
 * page all come from the script's own box in Ops.
 */
const KEY = "platterly-consent";
type Kind = "analytics" | "marketing";
type Choices = Partial<Record<Kind, boolean>>;
const KIND_LABEL: Record<Kind, string> = { analytics: "Analytics", marketing: "Marketing" };

const listeners = new Set<() => void>();
let reopened = false;
const loaded = new Set<string>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const notify = () => listeners.forEach((cb) => cb());

function readRaw(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}
function parse(raw: string): Choices {
  try {
    const value = JSON.parse(raw) as Choices;
    return { ...(typeof value.analytics === "boolean" && { analytics: value.analytics }), ...(typeof value.marketing === "boolean" && { marketing: value.marketing }) };
  } catch {
    return {};
  }
}

/** Runs each <script> (and adds each <style>) in the pasted text where the script's box says. Scripts set through innerHTML never
 * run, so each one is rebuilt as a real element. Anything inside <noscript> is skipped: it only applies with JavaScript off. */
function run(script: SiteScript) {
  const doc = new DOMParser().parseFromString(script.code, "text/html");
  for (const old of Array.from(doc.querySelectorAll("script, style"))) {
    if (old.closest("noscript")) continue;
    const el = document.createElement(old.tagName.toLowerCase());
    for (const { name, value } of Array.from(old.attributes)) el.setAttribute(name, value);
    el.textContent = old.textContent;
    el.setAttribute("data-platterly-script", script.id);
    if (script.placement === "head") document.head.appendChild(el);
    else if (script.placement === "body") document.body.insertBefore(el, document.body.firstChild);
    else document.body.appendChild(el);
  }
}

/** Removes the cookies a kind of script listed (a name, or the start of one), on this host and its parent domain. */
function clearCookies(prefixes: string[]) {
  if (!prefixes.length) return;
  const parts = location.hostname.split(".");
  const domains = [undefined, location.hostname, ...(parts.length > 2 ? [`.${parts.slice(-2).join(".")}`] : [`.${location.hostname}`])];
  for (const entry of document.cookie.split(";")) {
    const name = entry.split("=")[0].trim();
    if (!prefixes.some((p) => name.startsWith(p))) continue;
    for (const domain of domains) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domain ? `; domain=${domain}` : ""}`;
  }
}
const cookieNames = (scripts: SiteScript[]) => scripts.flatMap((s) => s.cookies.split(",").map((c) => c.trim()).filter(Boolean));

function save(next: Choices, scripts: SiteScript[], before: Choices) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode: the notice asks again next visit */
  }
  reopened = false;
  let reload = false;
  for (const kind of ["analytics", "marketing"] as const) {
    if (next[kind] !== false || before[kind] === false) continue;
    const ofKind = scripts.filter((s) => s.kind === kind);
    clearCookies(cookieNames(ofKind));
    // A script already running in this page cannot be stopped, so reload without it.
    if (ofKind.some((s) => loaded.has(s.id))) reload = true;
  }
  if (reload) return location.reload();
  notify();
}

/** The footer's "Cookie settings" link: asks the question again. */
export function CookieSettingsButton() {
  return (
    <button type="button" onClick={() => { reopened = true; notify(); }} className="transition-colors hover:text-cloud" data-testid="cookie-settings">
      Cookie settings
    </button>
  );
}

export function CookieConsent({ scripts }: { scripts: SiteScript[] }) {
  // "server" until the browser has read the saved choice, so nothing flashes for someone who already answered.
  const state = useSyncExternalStore(subscribe, () => `${readRaw()}|${reopened}`, () => "server");
  const choices = state === "server" ? {} : parse(state.slice(0, state.lastIndexOf("|")));
  useEffect(() => {
    if (state === "server") return;
    for (const s of scripts) {
      if (loaded.has(s.id) || (s.kind !== "essential" && choices[s.kind] !== true)) continue;
      loaded.add(s.id);
      run(s);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scripts, state]);

  const kinds = (["analytics", "marketing"] as const).filter((k) => scripts.some((s) => s.kind === k));
  if (!kinds.length || state === "server") return null;
  const asking = reopened || kinds.some((k) => choices[k] === undefined);
  if (!asking) return null;
  return <Notice scripts={scripts} kinds={kinds} choices={choices} />;
}

function Notice({ scripts, kinds, choices }: { scripts: SiteScript[]; kinds: Kind[]; choices: Choices }) {
  const [picked, setPicked] = useState<Choices>(() => Object.fromEntries(kinds.map((k) => [k, choices[k] === true])));
  const all = (value: boolean): Choices => Object.fromEntries(kinds.map((k) => [k, value]));
  const many = kinds.length > 1;
  const btn = "rounded-button px-4 py-2 text-sm font-medium transition-colors";
  return (
    <div role="dialog" aria-label="Cookie notice" data-testid="cookie-notice" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-[20px] bg-ink-navy p-5 text-cloud shadow-lg sm:inset-x-6 sm:bottom-6">
      <p className="text-sm leading-relaxed">This website would like to use the tools below. They stay off unless you accept. See our <Link href="/cookie-policy/" className="underline underline-offset-2">Cookie Policy</Link>.</p>
      <ul className="mt-3 grid gap-2 text-sm">
        {kinds.map((kind) => (
          <li key={kind} className="rounded-xl bg-cloud/10 p-3">
            <label className="flex items-start gap-2">
              {many && <input type="checkbox" checked={!!picked[kind]} onChange={(e) => setPicked({ ...picked, [kind]: e.target.checked })} className="mt-1 size-4 accent-[#ff6900]" data-testid={`cookie-${kind}`} />}
              <span>
                <span className="font-medium">{KIND_LABEL[kind]}</span>
                <span className="block text-cloud/80">
                  {scripts.filter((s) => s.kind === kind).map((s) => (s.description ? `${s.name} (${s.description})` : s.name)).join(", ")}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => save(all(false), scripts, choices)} className={`${btn} border border-cloud/30 hover:bg-cloud/10`} data-testid="cookie-decline">{many ? "Decline all" : "Decline"}</button>
        {many && <button type="button" onClick={() => save(picked, scripts, choices)} className={`${btn} border border-cloud/30 hover:bg-cloud/10`} data-testid="cookie-save">Save my choices</button>}
        <button type="button" onClick={() => save(all(true), scripts, choices)} className={`${btn} bg-brand text-ink-navy hover:bg-brand-dark`} data-testid="cookie-accept">{many ? "Accept all" : "Accept"}</button>
      </div>
    </div>
  );
}
