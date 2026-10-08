import Link from "next/link";
import { Badge, Table } from "@/components/ui";
import { LEGAL_SLUGS } from "@/modules/site-content/limits";
import { listLegalPages } from "@/modules/site-content/site-content";

export const dynamic = "force-dynamic";
export const metadata = { title: "Legal pages" };

export default async function LegalPagesPage() {
  const saved = new Map((await listLegalPages()).map((p) => [p.slug, p]));
  return (
    <>
      <p className="mb-4 max-w-2xl text-sm text-muted-foreground">Privacy, terms and the other policy pages. The addresses are fixed; the text is yours.</p>
      <Table head={["Page", "Address", "Last updated", "Status"]}>
        {LEGAL_SLUGS.map(({ slug, label }) => {
          const page = saved.get(slug);
          return (
            <tr key={slug}>
              <td><Link className="font-medium text-accent-foreground hover:underline" href={`/site/pages/${slug}`}>{label}</Link></td>
              <td className="font-mono text-xs text-muted-foreground">/{slug}/</td>
              <td>{page?.updated ?? "—"}</td>
              <td>{page ? <Badge tone="success">Managed here</Badge> : <Badge>Using the site&apos;s own copy</Badge>}</td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
