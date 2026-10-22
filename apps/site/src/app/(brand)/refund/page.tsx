import type { Metadata } from "next";
import { ContentPage } from "@/components/content-page";
import { getPage } from "@/lib/content";
import { pageLinks } from "@/content/site";

export const metadata: Metadata = {
  title: "Cancellation and Refund Policy",
  description: "How Caterly by Platterly plans are paid, how to cancel, what happens if a payment is missed, and why plan payments are not refunded.",
  ...pageLinks("/refund/"),
};

/** DRAFT for legal review before launch. The text is in src/content/pages/refund.md. */
export default async function Page() {
  return <ContentPage page={await getPage("refund")} />;
}
