// Loads the marketing site's current text (apps/site/src/content) into ops so the Website screens start with what is live.
//   npm run ops:import-site            (dry run: says what it would add)
//   npm run ops:import-site -- --apply (adds what is missing; never overwrites something already saved in ops)
// Needs Node 22.6+ (it reads the site's TypeScript content files directly).
import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

const apply = process.argv.includes("--apply");
const content = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "site", "src", "content");
const load = async (name) => import(pathToFileURL(join(content, name)).href);

function frontMatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { data: {}, body: raw };
  const data = {};
  for (const line of match[1].split("\n")) {
    const at = line.indexOf(":");
    if (at > 0) data[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return { data, body: raw.slice(match[0].length).trim() };
}

const { NOTICE } = await load("notice.ts");
const { RELEASES } = await load("releases.ts");
const { CONTACT } = await load("site.ts");
const posts = readdirSync(join(content, "posts")).filter((f) => f.endsWith(".md")).map((f) => {
  const { data, body } = frontMatter(readFileSync(join(content, "posts", f), "utf8"));
  const slug = f.replace(/\.md$/, "");
  return { slug, title: data.title ?? slug, excerpt: data.excerpt ?? "", date: data.date ?? "", author: data.author ?? "The Platterly team", tags: (data.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean), colourway: data.colourway ?? "sunrise", body };
});
const pages = readdirSync(join(content, "pages")).filter((f) => f.endsWith(".md")).map((f) => {
  const { data, body } = frontMatter(readFileSync(join(content, "pages", f), "utf8"));
  const slug = f.replace(/\.md$/, "");
  return { slug, title: data.title ?? slug, summary: data.summary ?? "", updated: data.updated ?? "", body };
});

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const added = { settings: 0, releases: 0, posts: 0, pages: 0 };
const client = await pool.connect();
try {
  await client.query("BEGIN");
  for (const [key, value] of [["notice", { enabled: NOTICE.enabled, text: NOTICE.text, linkLabel: NOTICE.linkLabel ?? "", linkHref: NOTICE.linkHref ?? "" }], ["contact", CONTACT]]) {
    const r = await client.query('INSERT INTO site_setting (key, value, "updatedAt") VALUES ($1, $2, now()) ON CONFLICT (key) DO NOTHING', [key, JSON.stringify(value)]);
    added.settings += r.rowCount;
  }
  for (const r of RELEASES) {
    const res = await client.query('INSERT INTO site_release (id, date, title, body, kind, "updatedAt") VALUES ($1,$2,$3,$4,$5, now()) ON CONFLICT (id) DO NOTHING', [r.id, r.date, r.title, r.body, r.kind]);
    added.releases += res.rowCount;
  }
  for (const p of posts) {
    const res = await client.query('INSERT INTO site_post (slug, title, excerpt, date, author, tags, colourway, body, "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now()) ON CONFLICT (slug) DO NOTHING', [p.slug, p.title, p.excerpt, p.date, p.author, p.tags, p.colourway, p.body]);
    added.posts += res.rowCount;
  }
  for (const p of pages) {
    const res = await client.query('INSERT INTO site_legal_page (slug, title, summary, updated, body, "updatedAt") VALUES ($1,$2,$3,$4,$5, now()) ON CONFLICT (slug) DO NOTHING', [p.slug, p.title, p.summary, p.updated, p.body]);
    added.pages += res.rowCount;
  }
  await client.query(apply ? "COMMIT" : "ROLLBACK");
  console.log(`${apply ? "Added" : "Would add"}: ${added.settings} settings (notice, contact), ${added.releases} updates, ${added.posts} posts, ${added.pages} legal pages. Rows already in ops were left alone.`);
  if (!apply) console.log("Dry run only. Run again with --apply to write.");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
