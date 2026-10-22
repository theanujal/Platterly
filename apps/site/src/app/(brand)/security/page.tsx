import type { Metadata } from "next";
import { ContentPage } from "@/components/content-page";
import { getPage } from "@/lib/content";
import { pageLinks } from "@/content/site";

export const metadata: Metadata = {
  title: "Security",
  description: "How Caterly by Platterly keeps each business's data separate, controls who sees what, protects sign-in and payments, and how to report a security problem.",
  ...pageLinks("/security/"),
};

/** DRAFT for legal review before launch. The text is in src/content/pages/security.md. */
export default async function Page() {
  return <ContentPage page={await getPage("security")} />;
}
