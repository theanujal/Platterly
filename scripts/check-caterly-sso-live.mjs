// Live check of single sign-in and sign-out with a REAL account, in a separate headless browser (nothing is stored; the password is asked for with hidden
// input, so it never lands in a log or chat). Needs the Platform on 3300 and Caterly running.
//   node scripts/check-caterly-sso-live.mjs kitchen@platterly.local
// It signs in through Caterly, signs out at Caterly, signs in at the Account, opens Caterly, and signs out at the Account. NOTE: signing out at the Account
// ends ALL of that person's Caterly sessions (that is how the back-channel works), so a Caterly tab you have open in your own browser will be signed out too.
import { chromium } from "@playwright/test";

const email = process.argv[2];
if (!email) throw new Error("usage: node scripts/check-caterly-sso-live.mjs <email>");
const CATERLY = "http://catering.localhost:3000";
const ACCOUNT = "http://account.localhost:3300";

const password = await new Promise((resolve) => {
  process.stdout.write(`Password for ${email} (hidden): `);
  const stdin = process.stdin;
  stdin.setRawMode?.(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  let value = "";
  stdin.on("data", (ch) => {
    for (const c of ch) {
      if (c === "\r" || c === "\n") {
        stdin.setRawMode?.(false);
        stdin.pause();
        process.stdout.write("\n");
        return resolve(value);
      }
      if (c === "\u0003") process.exit(130);
      value = c === "\u007f" ? value.slice(0, -1) : value + c;
    }
  });
});

let failed = 0;
const step = async (name, fn) => {
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}\n      ${String(e.message).split("\n")[0].slice(0, 200)}`);
  }
};
const must = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
page.setDefaultTimeout(20_000);
const caterlyEmail = async () => ((await (await page.request.get(`${CATERLY}/api/auth/get-session`)).json())?.user?.email ?? null);
const fillCentral = async () => {
  await page.locator('[data-hydrated="true"]').waitFor();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /^Sign in( to your account)?$/ }).click();
};
const closeDialog = async () => {
  const close = page.getByRole("button", { name: "Close" });
  if (await close.isVisible().catch(() => false)) await close.click().catch(() => {});
};

try {
  await step("1. Opening Caterly signed out goes to the central page (Caterly's look)", async () => {
    await page.goto(`${CATERLY}/`);
    await page.waitForURL(/auth\.localhost:3300\/sign-in\?/);
    must(await page.getByText("Run your catering business from one place").isVisible(), "the Caterly-style panel is not showing");
  });
  await step("2. Signing in there lands on the Caterly dashboard, signed in as you", async () => {
    await fillCentral();
    await page.waitForURL(/catering\.localhost:3000\/(dashboard|kitchenlogin\/onboarding)/);
    must((await caterlyEmail()) === email, `Caterly session is for ${await caterlyEmail()}, not ${email}`);
  });
  await step("3. Signing out at Caterly ends the central session too (the next visit shows the sign-in form, not an automatic sign-in)", async () => {
    await closeDialog();
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await page.waitForURL(/auth\.localhost:3300\/sign-in\?/);
    must((await caterlyEmail()) === null, "Caterly still has a session");
  });
  await step("4. Signing in at the Account works", async () => {
    await page.goto(`${ACCOUNT}/`);
    await page.waitForURL(/auth\.localhost:3300\/sign-in\?/);
    await page.locator('[data-hydrated="true"]').waitFor();
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: /^Sign in( to your account)?$/ }).click();
    await page.waitForURL(`${ACCOUNT}/`);
  });
  await step("5. Single sign-on: opening Caterly now goes straight to the dashboard, with no sign-in page", async () => {
    const seen = [];
    page.on("framenavigated", (f) => f === page.mainFrame() && /auth\.localhost:3300\/sign-in/.test(f.url()) && seen.push(f.url()));
    await page.goto(`${CATERLY}/`);
    await page.waitForURL(/catering\.localhost:3000\/(dashboard|kitchenlogin\/onboarding)/);
    must(seen.length === 0, "the central sign-in page appeared");
    must((await caterlyEmail()) === email, "not signed in to Caterly as you");
  });
  await step("6. Signing out at the Account ends the Caterly session too (within a few seconds, without visiting Caterly)", async () => {
    await page.goto(`${ACCOUNT}/`);
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL(/auth\.localhost:3300\/sign-in\?/);
    let gone = false;
    for (let i = 0; i < 20 && !gone; i++) {
      gone = (await caterlyEmail()) === null;
      if (!gone) await page.waitForTimeout(500);
    }
    must(gone, "the Caterly session is still alive after 10 seconds");
  });
} finally {
  await browser.close();
}
console.log(failed === 0 ? "\nRESULT: sign-in and sign-out work in both directions for this account." : `\nRESULT: ${failed} step(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
