import type { Metadata } from "next";
import { ContentPage } from "@/components/content-page";
import { getPage } from "@/lib/content";

export const metadata: Metadata = {
  title: "Security",
  description: "How we protect your business information and how to report a problem.",
  alternates: { canonical: "/security/" },
};

/** DRAFT for legal review before launch. The text is in src/content/pages/security.md. */
export default async function Page() {
  return <ContentPage page={await getPage("security")} />;
}
