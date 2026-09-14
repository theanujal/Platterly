import type { Metadata } from "next";
import Link from "next/link";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { listPackages } from "@/modules/menus/package";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PackageRowActions } from "./_components/package-row-actions";

export const metadata: Metadata = {
  title: "Menu Packages — Platterly",
  robots: { index: false, follow: false },
};

export default async function PackagesPage() {
  const { organizationId } = await requireActiveOrganization();
  const packages = await listPackages(organizationId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Packages</h1>
          <p className="text-sm text-muted-foreground">Sellable, priced bundles for Quotations and Orders.</p>
        </div>
        <Button render={<Link href="/menu-catalog/packages/new" />} nativeButton={false}>
          New Package
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Pricing</TableHead>
            <TableHead>Guests</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {packages.map((pkg) => (
            <TableRow key={pkg.id}>
              <TableCell>
                <Link href={`/menu-catalog/packages/${pkg.id}`} className="font-medium hover:underline">
                  {pkg.name}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {pkg.pricingModel === "FIXED" ? `₹${Number(pkg.fixedPrice).toFixed(2)} fixed` : `₹${Number(pkg.perPersonPrice).toFixed(2)}/guest`}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {pkg.minGuests ?? "—"}
                {" – "}
                {pkg.maxGuests ?? "—"}
              </TableCell>
              <TableCell>
                <Badge variant={pkg.isActive ? "default" : "secondary"}>{pkg.isActive ? "Active" : "Inactive"}</Badge>
              </TableCell>
              <TableCell>
                <PackageRowActions packageId={pkg.id} name={pkg.name} />
              </TableCell>
            </TableRow>
          ))}
          {packages.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                No packages yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
