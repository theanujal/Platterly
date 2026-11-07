import Image from "next/image";
import { redirect } from "next/navigation";
import { BarChart3, Boxes, ShieldCheck, Users } from "lucide-react";
import { getStaff } from "@/lib/session";
import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in" };

const FEATURES = [
  { icon: Users, label: "Every customer account across all products" },
  { icon: Boxes, label: "Products, plans and subscriptions" },
  { icon: BarChart3, label: "Billing, payments and reports" },
  { icon: ShieldCheck, label: "Staff-only, audited access" },
];

/** Split screen like the catering sign-in: orange brand panel on the left, the form on the right. */
export default async function SignInPage() {
  if (await getStaff()) redirect("/");
  return (
    <div className="flex min-h-svh w-full flex-col md:flex-row">
      <div className="hidden flex-col justify-center gap-10 bg-gradient-to-br from-primary to-[#9a3412] px-12 py-16 text-primary-foreground md:flex md:w-1/2">
        <div className="flex flex-col gap-4">
          <p className="text-xs font-bold uppercase tracking-wider text-primary-foreground/80">Platterly Ops</p>
          <h1 className="max-w-md text-balance text-4xl font-extrabold">Run the Platterly platform from one place</h1>
          <p className="max-w-sm text-sm text-primary-foreground/85">
            The operations console for the Platterly team: customers, products, billing and support, across every Platterly product.
          </p>
        </div>
        <ul className="flex flex-col gap-4">
          {FEATURES.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-3 text-sm font-medium">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
                <Icon className="size-4" aria-hidden />
              </span>
              {label}
            </li>
          ))}
        </ul>
      </div>
      <main className="flex flex-1 items-center justify-center bg-muted p-8">
        <div className="w-full max-w-sm">
          <Image src="/platterly-logo.png" alt="Platterly" width={1200} height={270} priority className="mb-8 h-9 w-auto" />
          <h2 className="text-2xl font-semibold">Sign in</h2>
          <p className="mb-6 mt-1 text-sm text-muted-foreground">Staff only. Accounts are created by an existing operator.</p>
          <SignInForm />
        </div>
      </main>
    </div>
  );
}
