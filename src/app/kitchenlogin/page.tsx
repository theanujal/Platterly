import type { Metadata } from "next";

// Placeholder — Caterer/Kitchen Admin login + signup entry point (Chunk 4.1).
// Reserves this path on the shared app subdomain per Chunk 1 Group 1.4; real
// auth UI and the 5-step onboarding wizard land in Chunk 4.
export const metadata: Metadata = {
  title: "Sign in — Platterly",
  robots: { index: false, follow: false },
};

export default function KitchenAdminLoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-xl font-semibold">Caterer / Kitchen Admin</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Login and onboarding coming in Chunk 4.
        </p>
      </div>
    </main>
  );
}
