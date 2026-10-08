import { notFound } from "next/navigation";
import type { ProductManifest } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { Badge, Button, Card, Field, PageHeader, Table, formatWhen, inputClass } from "@/components/ui";
import { finishRotationAction, refreshManifestAction, setInvoicePrefixAction, updateProductAction } from "../actions";
import { RotateForm } from "./rotate-form";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ prefixError?: string }> }) {
  const { key } = await params;
  const { prefixError } = await searchParams;
  const product = await prisma.product.findUnique({ where: { key }, include: { _count: { select: { businesses: true, events: true } }, invoiceCounter: true } });
  if (!product) notFound();
  const manifest = product.manifest as unknown as ProductManifest | null;
  const rotating = product.outboundSecretPrevious !== null || product.inboundSecretPrevious !== null;

  return (
    <>
      <PageHeader title={product.name} description={`Key ${product.key} · ${product._count.businesses} businesses · ${product._count.events} events received`} actions={<Badge tone={product.status === "ACTIVE" ? "success" : "neutral"}>{product.status === "ACTIVE" ? "Active" : "Disabled"}</Badge>} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-base font-semibold">Settings</h2>
          <form action={updateProductAction} className="flex flex-col gap-4">
            <input type="hidden" name="key" value={product.key} />
            <Field label="Name" htmlFor="name"><input id="name" name="name" defaultValue={product.name} required className={inputClass} /></Field>
            <Field label="Base URL" htmlFor="baseUrl" hint="Changing this is how a product moves to another server.">
              <input id="baseUrl" name="baseUrl" defaultValue={product.baseUrl} required className={inputClass} />
            </Field>
            <Field label="Status" htmlFor="status" hint="A disabled product's events are refused.">
              <select id="status" name="status" defaultValue={product.status} className={inputClass}>
                <option value="ACTIVE">Active</option>
                <option value="DISABLED">Disabled</option>
              </select>
            </Field>
            <div><Button type="submit">Save settings</Button></div>
          </form>
        </Card>

        <Card>
          <h2 className="mb-1 text-base font-semibold">Invoice numbering</h2>
          <p className="mb-4 text-sm text-muted-foreground">This product&apos;s invoices carry its own prefix and run on their own number: {product.invoiceCounter?.lastNumber ?? 0} issued so far. Changing the prefix affects new invoices only; issued ones keep what was printed.</p>
          <form action={setInvoicePrefixAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="key" value={product.key} />
            <Field label="Invoice prefix" htmlFor="invoicePrefix" hint="1 to 6 letters or digits, different for every product."><input id="invoicePrefix" name="invoicePrefix" defaultValue={product.invoicePrefix ?? ""} maxLength={6} required className={`${inputClass} w-40 font-mono uppercase`} /></Field>
            <Button type="submit" size="md">Save prefix</Button>
          </form>
          {prefixError ? <p role="alert" className="mt-3 text-sm text-destructive">{prefixError}</p> : null}
        </Card>

      </div>

      <Card className="mt-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">What it offers</h2>
            <p className="text-sm text-muted-foreground">{manifest ? `What this product offers (plans, limits, reports). Read ${formatWhen(product.manifestFetchedAt)}; Ops checks again by itself every day.` : "Waiting for the product to connect. Once its connection settings are in its environment and it is running, Ops reads what it offers by itself."}</p>
          </div>
          <form action={refreshManifestAction}>
            <input type="hidden" name="key" value={product.key} />
            <Button type="submit" variant="outline" size="md">Check connection now</Button>
          </form>
        </div>
        {product.manifestError ? <p role="alert" className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{product.manifestError}</p> : null}
        {manifest ? (
          <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            <div>
              <h3 className="mb-2 text-sm font-semibold">Entitlements</h3>
              <Table head={["Key", "Type", "Label"]}>
                {manifest.entitlements.map((e) => (
                  <tr key={e.key}><td className="font-mono text-xs">{e.key}</td><td>{e.type}</td><td>{e.label}</td></tr>
                ))}
              </Table>
            </div>
            <div className="text-sm">
              <h3 className="mb-2 text-sm font-semibold">Trial defaults</h3>
              <p className="mb-2 text-muted-foreground">{manifest.trial.days} days</p>
              <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs">{JSON.stringify(manifest.trial.entitlements, null, 2)}</pre>
            </div>
          </div>
        ) : null}
      </Card>

      <details className="mt-6 rounded-xl bg-card p-5 shadow-[0_0_0_1px_rgba(17,24,39,0.1)]">
        <summary className="cursor-pointer text-base font-semibold">Advanced: connection secrets</summary>
        <p className="mb-4 mt-3 text-sm text-muted-foreground">Only needed if a connection secret has leaked or the product moves to a new server.</p>
        <div>
          <h3 className="mb-1 text-sm font-semibold">Rotate the secrets</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            {product.secretsRotatedAt ? `Last rotated ${formatWhen(product.secretsRotatedAt)}.` : "Never rotated."} Old secrets stay valid until you finish the rotation.
          </p>
          <RotateForm productKey={product.key} />
          {rotating ? (
            <form action={finishRotationAction} className="mt-4 rounded-xl bg-muted p-4 text-sm">
              <input type="hidden" name="key" value={product.key} />
              <p className="mb-3">The previous secrets are still accepted. Once the product runs on the new ones, finish the rotation.</p>
              <Button type="submit" variant="outline" size="md">Finish rotation</Button>
            </form>
          ) : null}
        </div>
      </details>
    </>
  );
}
