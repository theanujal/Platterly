// Runs before `dev` and `build`. When OPS_CONTENT_URL and SITE_SECRET are set it fetches the site's text from Platterly Ops
// (signed request) and saves it to src/content/.ops/bundle.json, which src/lib/content.ts reads. When neither is set it removes
// any saved copy, so local work and CI use the files in this repo. A failed fetch exits 1: a deploy must not go out with stale text.
import { createHmac } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const file = join(here, "..", "src", "content", ".ops", "bundle.json");
const uploads = join(here, "..", "public", "uploads");
const url = process.env.OPS_CONTENT_URL;
const secret = process.env.SITE_SECRET;

if (!url && !secret) {
  rmSync(file, { force: true });
  rmSync(uploads, { recursive: true, force: true });
  console.log("[content] OPS_CONTENT_URL and SITE_SECRET not set: using the content files in this repo.");
  process.exit(0);
}
if (!url || !secret) {
  console.error("[content] Set both OPS_CONTENT_URL and SITE_SECRET to build from Platterly Ops, or neither to use the files in this repo.");
  process.exit(1);
}

try {
  // docs/ops-contract.md, "The website content": HMAC-SHA256 over "<timestamp>." (an empty body), like every signed ops call.
  const signed = () => {
    const timestamp = Math.floor(Date.now() / 1000);
    return { "x-platterly-timestamp": String(timestamp), "x-platterly-signature": `v1=${createHmac("sha256", secret).update(`${timestamp}.`).digest("hex")}`, "x-platterly-event-id": `site-build-${timestamp}`, "x-platterly-contract": "1" };
  };
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: signed() });
  if (!response.ok) throw new Error(`Platterly Ops refused the content request (${response.status}). Check OPS_CONTENT_URL and SITE_SECRET.`);
  const data = await response.json();
  if (data.version !== 1 || !Array.isArray(data.releases) || !Array.isArray(data.posts) || !Array.isArray(data.pages)) throw new Error("Platterly Ops sent content in a shape this site does not understand.");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data));
  // Pictures: copy the ones the content refers to ("/uploads/<name>", or a post's share picture) into public/uploads, so the
  // finished site carries its own pictures and never depends on Ops being up.
  const wanted = new Set();
  const scan = (text) => { for (const m of String(text ?? "").matchAll(/\/uploads\/([a-z0-9][a-z0-9._-]*)/g)) wanted.add(m[1]); };
  for (const x of [...data.posts, ...data.pages, ...data.releases]) scan(x.body);
  for (const post of data.posts) if (post.ogImage && !/^https:\/\//.test(post.ogImage)) wanted.add(post.ogImage.replace(/^\/uploads\//, ""));
  rmSync(uploads, { recursive: true, force: true });
  if (wanted.size > 0) mkdirSync(uploads, { recursive: true });
  for (const name of wanted) {
    const picture = await fetch(new URL(`/api/site/media/${encodeURIComponent(name)}`, url), { signal: AbortSignal.timeout(30_000), headers: signed() });
    if (!picture.ok) throw new Error(`The picture ${name} is used by the content but Ops answered ${picture.status} for it.`);
    writeFileSync(join(uploads, name), Buffer.from(await picture.arrayBuffer()));
  }
  console.log(`[content] Fetched from Platterly Ops: ${data.posts.length} posts, ${data.releases.length} updates, ${data.pages.length} legal pages, ${wanted.size} pictures.`);
} catch (error) {
  console.error(`[content] ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
