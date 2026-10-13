import type { Metadata } from "next";
import { DM_Sans, Geist_Mono } from "next/font/google";
import { Agentation } from "agentation";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NoWheelNumberInputs } from "@/components/ui/no-wheel-number-inputs";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Caterly by Platterly",
  description: "Run your catering business from enquiry to event: customers, menus, orders, kitchen and payments in one place.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* suppressHydrationWarning: some browser extensions (e.g. ColorZilla)
          inject attributes like cz-shortcut-listen onto <body> before React
          hydrates — a real mismatch there is unavoidable and not a bug in
          this app. Scoped to this element only, not deep-tree suppression. */}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <TooltipProvider>{children}</TooltipProvider>
        <NoWheelNumberInputs />
        {process.env.NODE_ENV !== "production" && <Agentation />}
      </body>
    </html>
  );
}
