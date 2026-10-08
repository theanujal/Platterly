// Checks the built site in out/: every internal link and media file exists, and every page has what search and sharing need.
// Run after `npm run build`: node scripts/check-links.mjs
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "out");
if (!existsSync(out)) {
  console.error("No out/ folder: run `npm run build` first.");
  process.exit(1);
}

const pages = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (name.endsWith(".html")) pages.push(full);
  }
})(out);

const problems = [];
const fileFor = (url) => {
  const clean = url.split("#")[0].split("?")[0];
  if (clean === "" || clean === "/") return join(out, "index.html");
  const direct = join(out, clean);
  if (existsSync(direct) && statSync(direct).isFile()) return direct;
  const asDir = join(direct, "index.html");
  return existsSync(asDir) ? asDir : null;
};

for (const page of pages) {
  const rel = page.slice(out.length);
  if (rel.includes("404") || rel.includes("_not-found")) continue;
  const html = readFileSync(page, "utf8");
  const here = rel === "/index.html" ? "/" : rel.replace(/index\.html$/, "");
  const fail = (message) => problems.push(`${here}  ${message}`);

  if (!/<title>[^<]{5,}<\/title>/.test(html)) fail("missing or short <title>");
  if (!/<meta name="description" content="[^"]{40,}"/.test(html)) fail("missing or short meta description");
  if (!/<link rel="canonical" href="https:\/\/platterly\.in\//.test(html)) fail("missing canonical link on platterly.in");
  const h1s = (html.match(/<h1[\s>]/g) ?? []).length;
  if (h1s !== 1) fail(`expected exactly one h1, found ${h1s}`);
  if (/<img(?![^>]*\balt=)[^>]*>/.test(html)) fail("an <img> has no alt attribute");
  if (!/property="og:image"/.test(html)) fail("missing og:image");
  if (/http:\/\/(?!localhost)/.test(html.replace(/xmlns="http:\/\/www\.w3\.org[^"]*"/g, ""))) fail("a plain http:// address is in the page");

  for (const match of html.matchAll(/(?:href|src|poster)="(\/[^"]*)"/g)) {
    const url = match[1];
    if (url.startsWith("//") || url.startsWith("/_next/")) continue;
    if (!fileFor(url)) fail(`broken internal reference: ${url}`);
  }
  for (const match of html.matchAll(/<a [^>]*href="(https?:\/\/[^"]+)"/g)) {
    const url = new URL(match[1]);
    if (!["catering.platterly.in", "platterly.in", "razorpay.com"].includes(url.hostname)) fail(`unexpected outside link: ${url.href}`);
  }
}

// every file the content refers to by name: the people photos and the gradient
const people = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "src", "content", "people.ts"), "utf8");
for (const match of people.matchAll(/photo: "([a-z-]+)"/g)) {
  if (!existsSync(join(out, "media", "people", `${match[1]}.webp`))) problems.push(`media: missing people/${match[1]}.webp`);
}
if (!existsSync(join(out, "media", "gradient.webp"))) problems.push("media: missing gradient.webp");
for (const required of ["sitemap.xml", "robots.txt", "og.png", "platterly-logo.svg"]) if (!existsSync(join(out, required))) problems.push(`missing ${required}`);

if (problems.length) {
  console.error(`${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(`Checked ${pages.length} pages: links, media, titles, descriptions, canonicals, one h1 each, alt text, og:image.`);
