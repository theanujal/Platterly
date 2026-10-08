import { notFound } from "next/navigation";
import { LEGAL_SLUGS } from "@/modules/site-content/limits";
import { getLegalPage } from "@/modules/site-content/site-content";
import { LegalForm } from "../../forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit legal page" };

export default async function EditLegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  const label = LEGAL_SLUGS.find((l) => l.slug === slug)?.label;
  if (!label) notFound();
  const page = await getLegalPage(slug);
  return <LegalForm values={page ?? { slug, title: label, summary: "", updated: new Date().toISOString().slice(0, 10), body: "" }} />;
}
