import type { Metadata } from "next";
import { ContentPage } from "@/components/content-page";
import { getPage } from "@/lib/content";
import { pageLinks } from "@/content/site";

export const metadata: Metadata = {
  title: "Terms and Conditions",
  description: "The terms for using Platterly and Caterly by Platterly: your account, the free trial and paid plans, your data, acceptable use, and how the service ends.",
  ...pageLinks("/terms/"),
};

/** DRAFT for legal review before launch. The text is in src/content/pages/terms.md. */
export default async function Page() {
  return <ContentPage page={await getPage("terms")} />;
}
