import type { Metadata } from "next";

// Placeholder — Super Admin login (Chunk 3.1). Reserves this path on the
// shared app subdomain per Chunk 1 Group 1.4; real auth UI lands in Chunk 3.
export const metadata: Metadata = {
  title: "Super Admin — Platterly",
  robots: { index: false, follow: false },
};

export default function SuperAdminLoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-xl font-semibold">Super Admin</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Login coming in Chunk 3.
        </p>
      </div>
    </main>
  );
}
