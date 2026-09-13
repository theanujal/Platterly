"use client";

import { useState } from "react";
import { SignInForm } from "./sign-in-form";
import { SignUpForm } from "./sign-up-form";

// Chunk 4 Group 4.1 — shown when no session exists yet.
export function AuthGate() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6">
      <div className="flex w-full flex-col items-center gap-1 text-center">
        <h2 className="text-2xl font-bold">{mode === "signin" ? "Welcome back" : "Create your account"}</h2>
        <p className="text-sm text-muted-foreground">
          {mode === "signin" ? "Sign in to manage your catering business" : "Start your free 7-day trial"}
        </p>
      </div>
      {mode === "signin" ? <SignInForm /> : <SignUpForm />}
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
