import { SignOutButton } from "./sign-out-button";

// Chunk 4 — no dashboard shell exists yet (that's Chunk 5). This is the
// deliberate landing state for an authenticated caterer until Chunk 5 picks
// a real destination — see dev plan judgment call 2.
export function OnboardingComplete({ businessName }: { businessName: string }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-xl font-semibold">You&apos;re all set, {businessName}!</h1>
      <p className="max-w-sm text-sm text-neutral-500">
        Your account and trial subscription are ready. The full Caterer Admin dashboard is coming in Chunk 5.
      </p>
      <SignOutButton />
    </main>
  );
}
