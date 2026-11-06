"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { AccountOverview, OverviewResult } from "@/modules/account/types";

/**
 * The Account's real data: one read of GET /api/account/overview per page view, shared by the shell and the page. The server decides who is
 * asking; this code never names a user or a business. The phases are exactly the states a screen has to show.
 */
export type DataState = { phase: "loading" } | { phase: "unauthenticated" } | { phase: "error" } | { phase: "ready"; overview: AccountOverview };
const Ctx = createContext<DataState>({ phase: "loading" });

export const OVERVIEW_URL = "/api/account/overview";

/** Turns an HTTP response into a phase. Anything unexpected is an error, never a guess. */
export async function readOverview(response: Response): Promise<DataState> {
  if (response.status === 401) return { phase: "unauthenticated" };
  if (!response.ok) return { phase: "error" };
  try {
    const body = (await response.json()) as OverviewResult;
    return body.status === "ok" && body.overview ? { phase: "ready", overview: body.overview } : { phase: "error" };
  } catch {
    return { phase: "error" };
  }
}

export function AccountDataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DataState>({ phase: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    fetch(OVERVIEW_URL, { cache: "no-store", credentials: "same-origin", signal: controller.signal })
      .then(readOverview)
      .then(setState)
      .catch((e: unknown) => {
        if ((e as { name?: string }).name !== "AbortError") setState({ phase: "error" });
      });
    return () => controller.abort();
  }, []);
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export const useAccountData = () => useContext(Ctx);

/** A full-width message in the page body, in the existing card style. */
export function StatePanel({ title, children, busy = false, action }: { title: string; children: ReactNode; busy?: boolean; action?: ReactNode }) {
  return (
    <section className="pa-card" role={busy ? "status" : "region"} aria-live="polite" aria-busy={busy} aria-label={title}>
      <h2>{title}</h2>
      <p className="pa-muted">{children}</p>
      {action}
    </section>
  );
}

/** Renders `children` only once the data is ready; otherwise the loading or error panel. Not signed in means: go to the sign-in page. */
export function DataGate({ children }: { children: (overview: AccountOverview) => ReactNode }) {
  const data = useAccountData();
  const pathname = usePathname();
  const signedOut = data.phase === "unauthenticated";
  useEffect(() => {
    // A missing cookie is handled before the page renders; this covers a cookie that is stale, expired or revoked.
    if (signedOut) window.location.replace(`/auth/start?next=${encodeURIComponent(pathname || "/")}`);
  }, [signedOut, pathname]);
  if (data.phase === "loading") return <StatePanel title="Loading your account" busy>One moment.</StatePanel>;
  if (data.phase === "unauthenticated") return <StatePanel title="Taking you to sign in" busy>One moment.</StatePanel>;
  if (data.phase === "error") return <StatePanel title="We could not load your account">Something went wrong on our side. Nothing was changed. Please reload the page in a moment.</StatePanel>;
  return <>{children(data.overview)}</>;
}

/** The business-scoped part of a page: the empty and forbidden answers get their own panel. */
export function BusinessGate({ overview, children }: { overview: AccountOverview; children: (b: Extract<AccountOverview["business"], { state: "ok" }>) => ReactNode }) {
  const b = overview.business;
  if (b.state === "none") return <StatePanel title="No business yet">This account does not have a business. A business appears here once one is created.</StatePanel>;
  if (b.state === "forbidden") return <StatePanel title="You no longer have access to this business">{b.reason === "member_removed" ? "Your access to the business was removed." : "Your Admin access to the business has ended."} Ask the current Admin if you need access.</StatePanel>;
  return <>{children(b)}</>;
}
