import Link from "next/link";

const links = [
  { href: "/super/dashboard", label: "Dashboard" },
  { href: "/super/tenants", label: "Caterers" },
  { href: "/super/plans", label: "Plans" },
];

export function SuperAdminNav() {
  return (
    <nav className="flex items-center gap-4 text-sm font-medium">
      <span className="mr-2 font-semibold">Platterly Super Admin</span>
      {links.map((link) => (
        <Link key={link.href} href={link.href} className="text-neutral-600 hover:text-foreground">
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
