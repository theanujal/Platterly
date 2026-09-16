"use client";

import { useState } from "react";
import { SignInForm } from "./sign-in-form";
import { SignUpForm } from "./sign-up-form";

interface AuthGateProps {
  initialMode?: "signin" | "signup";
  /** Threaded through to both forms — see their own prop comments. Used by
   * the invitation accept flow to bring an invited person back there. */
  callbackURL?: string;
  /** Threaded through to SignUpForm only — pre-fills and locks the email
   * field so an invited teammate signs up under the exact invited address. */
  lockedEmail?: string;
}

// Chunk 4 Group 4.1 — shown when no session exists yet.
export function AuthGate({ initialMode = "signin", callbackURL, lockedEmail }: AuthGateProps = {}) {
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);

  return (
    // max-w-lg = var(--container-lg) (AJ, 2026-09-17) — Tailwind's own
    // container scale, not an arbitrary value.
    <div className="flex w-full max-w-lg flex-col items-center gap-6">
      <div className="flex w-full flex-col items-center gap-3 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/platterly-mark.svg" alt="Platterly" className="size-14" />
        <h2 className="text-2xl font-bold">{mode === "signin" ? "Welcome back" : "Create your account"}</h2>
        <p className="text-sm text-muted-foreground">
          {mode === "signin" ? "Sign in to manage your catering business" : "Start your free 7-day trial"}
        </p>
      </div>
      {mode === "signin" ? (
        <SignInForm callbackURL={callbackURL} />
      ) : (
        <SignUpForm callbackURL={callbackURL} lockedEmail={lockedEmail} />
      )}
      <p className="text-sm text-muted-foreground">
        {mode === "signin" ? "New to Platterly? " : "Already have an account? "}
        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="font-semibold text-primary hover:underline"
        >
          {mode === "signin" ? "Create an account" : "Sign in"}
        </button>
      </p>
    </div>
  );
}
