// Builds public/og.png (the picture shown when a link is shared): the real logo on the site's magnolia canvas with the tagline.
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const logo = await sharp(readFileSync(fileURLToPath(new URL("../public/platterly-logo.svg", import.meta.url))), { density: 300 }).resize({ width: 520 }).png().toBuffer();
const text = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="#fcfbf8"/>
  <rect x="0" y="0" width="1200" height="12" fill="#ff6900"/>
  <text x="80" y="360" font-family="Helvetica, Arial, sans-serif" font-weight="500" font-size="68" fill="#071a31">Software built for</text>
  <text x="80" y="440" font-family="Helvetica, Arial, sans-serif" font-weight="500" font-size="68" fill="#071a31">the food business.</text>
  <text x="80" y="520" font-family="Helvetica, Arial, sans-serif" font-size="30" fill="#49535c">Starting with Catering by Platterly.</text>
</svg>`);
await sharp(text).composite([{ input: logo, left: 80, top: 90 }]).png().toFile(fileURLToPath(new URL("../public/og.png", import.meta.url)));
console.log("og.png written");
