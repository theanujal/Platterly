// Turns the raw captures (scripts/.raw/*.png, from `npm run capture`) into the site's pictures:
// a 1600px WebP for large screens, an 800px one for phones and a 2400px one for close-up crops. A clip's poster is a still of its screen.
import sharp from "sharp";
import { existsSync, readdirSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const raw = join(here, ".raw");
const out = join(here, "..", "public", "media");
mkdirSync(out, { recursive: true });

const posters = { tour: "dashboard", "kitchen-board": "kitchen" };
const names = readdirSync(raw).filter((f) => f.endsWith(".png")).map((f) => f.replace(".png", ""));
for (const [clip, still] of Object.entries(posters)) if (existsSync(join(raw, `${still}.png`))) names.push(clip);

for (const name of names) {
  const source = join(raw, `${posters[name] ?? name}.png`);
  await sharp(source).resize(1600, 1000, { fit: "cover" }).webp({ quality: 76 }).toFile(join(out, `${name}.webp`));
  await sharp(source).resize(800, 500, { fit: "cover" }).webp({ quality: 74 }).toFile(join(out, `${name}-800.webp`));
  // a sharper copy for the close-up crops in the big scenes
  await sharp(source).resize(2400, 1500, { fit: "cover" }).webp({ quality: 72 }).toFile(join(out, `${name}-hd.webp`));
}
console.log(`Optimised ${names.length} pictures into public/media`);
