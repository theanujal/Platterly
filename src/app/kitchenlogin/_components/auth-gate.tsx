"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SignInForm } from "./sign-in-form";
import { SignUpForm } from "./sign-up-form";

// Chunk 4 Group 4.1 — shown when no session exists yet.
export function AuthGate() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6">
      <div className="flex gap-2 rounded-lg bg-muted p-1">
        <Button
          type="button"
          variant={mode === "signin" ? "default" : "ghost"}
          size="sm"
          onClick={() => setMode("signin")}
        >
          Sign in
        </Button>
        <Button
          type="button"
          variant={mode === "signup" ? "default" : "ghost"}
          size="sm"
          onClick={() => setMode("signup")}
        >
          Sign up
        </Button>
      </div>
      {mode === "signin" ? <SignInForm /> : <SignUpForm />}
    </div>
  );
}
