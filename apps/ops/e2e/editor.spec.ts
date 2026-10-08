import { createHmac, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import pg from "../node_modules/pg/lib/index.js";

const EMAIL = `e2e-editor-${randomBytes(4).toString("hex")}@platterly.local`;
const PASSWORD = "E2e-Only-Pass-2026";
const SLUG = `e2e-editor-${randomBytes(3).toString("hex")}`;
const DRAFT = `e2e-draft-${randomBytes(3).toString("hex")}`;
const root = path.join(__dirname, "..");
// A real 1x1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

function envValue(name: string): string {
  if (process.env[name]) return process.env[name]!;
  return new RegExp(`^${name}="?([^"\\n]*)"?`, "m").exec(readFileSync(path.join(root, ".env"), "utf8"))?.[1] ?? "";
}
const pool = new pg.Pool({ connectionString: envValue("DATABASE_URL") });
let mediaName = "";

test.beforeAll(async () => {
  execFileSync("node", ["scripts/create-staff.mjs", "E2E Editor Staff", EMAIL], { cwd: root, env: { ...process.env, OPS_STAFF_PASSWORD: PASSWORD, DATABASE_URL: envValue("DATABASE_URL") }, stdio: "pipe" });
});
test.afterAll(async () => {
  await pool.query("delete from site_post where slug in ($1, $2)", [SLUG, DRAFT]);
  if (mediaName) await pool.query("delete from site_media where name = $1", [mediaName]);
  await pool.query('delete from "user" where email = $1', [EMAIL]);
  await pool.end();
});

const signed = () => {
  const ts = Math.floor(Date.now() / 1000);
  return { "x-platterly-timestamp": String(ts), "x-platterly-signature": `v1=${createHmac("sha256", envValue("SITE_SECRET")).update(`${ts}.`).digest("hex")}`, "x-platterly-event-id": "e2e" };
};

test("staff write a post in the visual editor with a picture, keep a draft out of the site, and the picture library protects what is in use", async ({ page, request }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.goto("/site/posts/new");
  await page.getByLabel("Title", { exact: true }).fill("E2E editor post");
  await page.getByLabel("Summary").fill("A short summary.");
  await page.getByLabel("Address").fill(SLUG);
  await page.getByLabel("Categories").fill("E2E");
  await page.getByLabel("Search title").fill("E2E search title");

  // Write with the toolbar: a heading, then bold text, then a bulleted list.
  const editor = page.getByRole("textbox", { name: "Post text" });
  await editor.click();
  await page.getByRole("button", { name: "Heading", exact: true }).click();
  await page.keyboard.type("A heading");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Bold" }).click();
  await page.keyboard.type("bold words");
  await page.getByRole("button", { name: "Bold" }).click();
  await page.keyboard.type(" and plain.");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Bulleted list" }).click();
  await page.keyboard.type("first point");

  // A picture: upload through the toolbar's file chooser; it appears in the text.
  await page.getByLabel("Picture file").setInputFiles({ name: "Kitchen Photo.png", mimeType: "image/png", buffer: PNG });
  await expect(editor.locator("img")).toHaveCount(1);
  const src = await editor.locator("img").getAttribute("src");
  mediaName = src!.replace("/uploads/", "");
  expect(mediaName).toMatch(/^[0-9a-f]{8}-kitchen-photo\.png$/);

  // The raw view shows the Markdown the site will use.
  await page.getByRole("button", { name: "Edit as Markdown" }).click();
  const raw = page.getByLabel("Post text as Markdown");
  await expect(raw).toHaveValue(/## A heading/);
  await expect(raw).toHaveValue(/\*\*bold words\*\* and plain\./);
  await expect(raw).toHaveValue(/- first point/);
  await expect(raw).toHaveValue(new RegExp(`!\\[[^\\]]*\\]\\(/uploads/${mediaName}\\)`));
  await page.getByRole("button", { name: "Back to the editor" }).click();

  await page.getByRole("button", { name: "Add post" }).click();
  await expect(page.locator("p[role=status]")).toContainText("Saved");
  const saved = (await pool.query("select body, \"metaTitle\", status from site_post where slug = $1", [SLUG])).rows[0];
  expect(saved.body).toContain("## A heading");
  expect(saved.body).toContain(`/uploads/${mediaName}`);
  expect(saved.metaTitle).toBe("E2E search title");
  expect(saved.status).toBe("PUBLISHED");

  // Pictures are served to signed-in staff and the signed site build only.
  expect((await page.request.get(`/uploads/${mediaName}`)).status()).toBe(200);
  expect((await request.get(`/api/site/media/${mediaName}`)).status()).toBe(401);
  const build = await request.get(`/api/site/media/${mediaName}`, { headers: signed() });
  expect(build.status()).toBe(200);
  expect(build.headers()["content-type"]).toBe("image/png");
  expect((await build.body()).equals(PNG)).toBe(true);

  // It is in the content the site builds from, with its picture listed.
  const bundle = await (await request.get("/api/site/content", { headers: signed() })).json();
  expect(bundle.posts.some((p: { slug: string }) => p.slug === SLUG)).toBe(true);
  expect(bundle.media).toContain(mediaName);

  // A draft is saved but kept out of the site's content.
  await page.goto(`/site/posts/new`);
  await page.getByLabel("Title", { exact: true }).fill("E2E draft post");
  await page.getByLabel("Summary").fill("Not yet.");
  await page.getByLabel("Address").fill(DRAFT);
  await page.getByLabel("Categories").fill("E2E");
  await page.getByRole("textbox", { name: "Post text" }).click();
  await page.keyboard.type("Work in progress.");
  await page.getByLabel("Status").selectOption("DRAFT");
  await page.getByRole("button", { name: "Add post" }).click();
  await expect(page.locator("p[role=status]")).toContainText("Saved");
  const withDraft = await (await request.get("/api/site/content", { headers: signed() })).json();
  expect(withDraft.posts.some((p: { slug: string }) => p.slug === DRAFT)).toBe(false);
  await page.goto("/site/posts");
  await expect(page.getByRole("row").filter({ hasText: "E2E draft post" })).toContainText("Draft");

  // The library shows the picture as used, and refuses to delete it while it is.
  await page.goto("/site/media");
  const card = page.locator("section").filter({ hasText: mediaName });
  await expect(card).toContainText("E2E editor post");
  await expect(card.getByRole("button", { name: "Delete" })).toBeDisabled();
  // Bad uploads are refused with a plain message.
  const refused = await page.request.post("/api/site/media", { multipart: { file: { name: "evil.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg onload='alert(1)'/>") } } });
  expect(refused.status()).toBe(400);
  expect((await refused.json()).error).toContain("PNG, JPG, GIF or WebP");
});
