import type { Metadata, Viewport } from "next";
import { Geist, Newsreader } from "next/font/google";
import "./globals.css";
import { JsonLd } from "@/components/json-ld";
import { SITE } from "@/content/site";

// Geist is the typeface calendly.com uses for its interface, and it is free (SIL Open Font License).
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
// Newsreader (also SIL Open Font License) stands in for the editorial serif Calendly sets its feature headings in.
const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-serif", display: "swap", weight: ["400", "500"] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: "Platterly | Software built for the food business", template: "%s | Platterly" },
  description: SITE.description,
  applicationName: "Platterly",
  openGraph: { siteName: "Platterly", type: "website", locale: "en_IN", images: [{ url: "/og.png", width: 1200, height: 630, alt: "Platterly" }] },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
  icons: { icon: "/platterly-mark.svg" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#fcfbf8" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${geist.variable} ${newsreader.variable}`} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-button focus:bg-ink-navy focus:px-4 focus:py-2 focus:text-paper">
          Skip to content
        </a>
        <JsonLd data={{ "@context": "https://schema.org", "@type": "Organization", name: "Platterly", url: SITE.url, logo: `${SITE.url}/platterly-logo.png`, email: SITE.contactEmail }} />
        {children}
      </body>
    </html>
  );
}
