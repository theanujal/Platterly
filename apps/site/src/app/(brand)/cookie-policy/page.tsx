import type { Metadata } from "next";
import { ContentPage } from "@/components/content-page";
import { getPage, getScripts } from "@/lib/content";
import { pageLinks } from "@/content/site";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "What cookies and similar storage Platterly uses, and how to control them.",
  ...pageLinks("/cookie-policy/"),
};

/** The text is in src/content/pages/cookie-policy.md. */
export default async function Page() {
  const page = await getPage("cookie-policy");
  // The tools that wait for a choice are listed from the same Ops list the cookie notice uses, so the two cannot disagree.
  const tools = (await getScripts()).filter((s) => s.kind !== "essential");
  if (!tools.length) return <ContentPage page={page} />;
  const cell = (text: string) => (text || "-").replace(/\|/g, "/").replace(/\s+/g, " ");
  const rows = tools.map((s) => `| ${cell(s.name)} | ${s.kind === "analytics" ? "Analytics" : "Marketing"} | ${cell(s.description)} | ${cell(s.cookies)} |`);
  const table = `\n\n## Tools on this website that need your consent\n\nThese run only after you accept their kind in the cookie notice, and you can change your choice with **Cookie settings** in the footer. Declining removes the cookies listed.\n\n| Tool | Kind | What it does | Cookies |\n|---|---|---|---|\n${rows.join("\n")}\n`;
  return <ContentPage page={{ ...page, body: page.body + table }} />;
}
