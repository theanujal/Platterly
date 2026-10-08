import type { Metadata } from "next";
import { ContentPage } from "@/components/content-page";
import { getPage } from "@/lib/content";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "What cookies and similar storage Platterly uses, and how to control them.",
  alternates: { canonical: "/cookie-policy/" },
};

/** DRAFT for legal review before launch. The text is in src/content/pages/cookie-policy.md. */
export default async function Page() {
  return <ContentPage page={await getPage("cookie-policy")} />;
}
