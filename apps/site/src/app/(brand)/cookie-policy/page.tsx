import type { Metadata } from "next";
import { ContentPage } from "@/components/content-page";
import { getPage } from "@/lib/content";
import { pageLinks } from "@/content/site";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "What cookies and similar storage Platterly uses, and how to control them.",
  ...pageLinks("/cookie-policy/"),
};

/** The text is in src/content/pages/cookie-policy.md. */
export default async function Page() {
  return <ContentPage page={await getPage("cookie-policy")} />;
}
