import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * The fallback suite (site.spec.ts) checks the site built from the files in this repo. A saved Ops bundle, or a build made from
 * one, would make it fail on text that is correct for that content, so stop with the reason instead of a confusing failure.
 */
export default function globalSetup() {
  const site = path.resolve(__dirname, "..");
  if (existsSync(path.join(site, "src", "content", ".ops", "bundle.json"))) {
    throw new Error("apps/site/src/content/.ops/bundle.json exists, so `npm run build` would use Ops content. The fallback suite needs the repo's own files: delete that file, run `npm run build` (with OPS_CONTENT_URL and SITE_SECRET unset), then run the tests again.");
  }
  const contact = path.join(site, "out", "contact", "index.html");
  if (existsSync(contact) && readFileSync(contact, "utf8").includes("Fixture Street 1")) {
    throw new Error("apps/site/out was built from the Ops-fed test fixture. Run `npm run build` (the repo's own files) before the fallback suite; `npm run test:e2e:ops-fed` does this by itself when it finishes.");
  }
}
