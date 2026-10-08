import type { Metadata } from "next";
import { ContentPage } from "@/components/content-page";
import { getPage } from "@/lib/content";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Platterly collects, uses, stores and protects personal information.",
  alternates: { canonical: "/privacy/" },
};

/** DRAFT for legal review before launch. The text is in src/content/pages/privacy.md. */
export default async function Page() {
  return <ContentPage page={await getPage("privacy")} />;
}
