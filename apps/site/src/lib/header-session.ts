"use client";

import { useEffect, useState } from "react";
import { SITE } from "@/content/site";

/**
 * Who is looking at the header, asked of the Platform after the page has loaded (the pages themselves stay static). The Platform answers only for a person who is
 * signed in, and only to this site's own pages. Anything else (not signed in, no answer, a slow answer, an unexpected answer) is "signed out": the header then shows
 * Contact Sales and Get Started, which is also what it shows before the answer arrives and without scripts.
 */
export interface HeaderProduct {
  key: string;
  name: string;
  openUrl: string;
}
export type HeaderSession = { status: "signed_out" } | { status: "signed_in"; name: string; initials: string; photoUrl: string | null; accountUrl: string; products: HeaderProduct[] };

/** Where to ask. `NEXT_PUBLIC_ACCOUNT_URL` is for local work (for example `http://account.localhost:3300/`); live, it is the Account's own address. */
const ENDPOINT = `${process.env.NEXT_PUBLIC_ACCOUNT_URL ?? SITE.accountUrl}api/account/header`;
const isText = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isWebAddress = (v: unknown): v is string => typeof v === "string" && /^https?:\/\//.test(v);

/** Trusts nothing: a shape that is not exactly what the Platform sends is treated as signed out. */
export function readHeaderSession(data: unknown): HeaderSession {
  const d = data as Record<string, unknown> | null;
  if (!d || d.status !== "signed_in" || !isText(d.name) || !isText(d.initials) || !isWebAddress(d.accountUrl) || !Array.isArray(d.products)) return { status: "signed_out" };
  const products = d.products.flatMap((p): HeaderProduct[] => {
    const item = p as Record<string, unknown> | null;
    return item && isText(item.key) && isText(item.name) && isWebAddress(item.openUrl) ? [{ key: item.key, name: item.name, openUrl: item.openUrl }] : [];
  });
  return { status: "signed_in", name: d.name, initials: d.initials.slice(0, 2).toUpperCase(), photoUrl: isWebAddress(d.photoUrl) ? d.photoUrl : null, accountUrl: d.accountUrl, products };
}

export function useHeaderSession(): HeaderSession {
  const [session, setSession] = useState<HeaderSession>({ status: "signed_out" });
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 5000);
    fetch(ENDPOINT, { credentials: "include", signal: controller.signal, headers: { accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setSession(readHeaderSession(data)))
      .catch(() => setSession({ status: "signed_out" }))
      .finally(() => window.clearTimeout(timer));
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, []);
  return session;
}
