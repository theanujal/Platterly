import { test, expect } from "@playwright/test";

/**
 * The site built from an Ops content bundle: e2e/fixtures/ops-bundle.json stands in for what Platterly Ops sends (contract section 26),
 * with fixed values that differ from the repo's own files. Run with `npm run test:e2e:ops-fed` (builds from the fixture, runs this,
 * then rebuilds the site from the repo's files). The fallback suite, site.spec.ts, checks the files in this repo.
 */

test("the notice bar shows the Ops text, closes, and stays closed", async ({ page }) => {
  await page.goto("/");
  const bar = page.getByText("Fixture notice: Caterly by Platterly is open for every catering kitchen.");
  await expect(bar).toBeVisible();
  await page.getByRole("button", { name: "Close announcement" }).click();
  await expect(bar).toHaveCount(0);
  await page.goto("/about/");
  await expect(bar).toHaveCount(0);
});

test("Contact shows the Ops details: email, phone, WhatsApp, hours and address", async ({ page }) => {
  await page.goto("/contact/");
  const channels = page.getByRole("list").filter({ has: page.getByRole("heading", { name: "Email" }) });
  await expect(channels.getByRole("link", { name: "fixture-hello@example.test" })).toHaveAttribute("href", "mailto:fixture-hello@example.test");
  await expect(channels.getByRole("heading", { name: "Phone" })).toBeVisible();
  await expect(channels.getByRole("link", { name: "+91 98000 00001" })).toHaveAttribute("href", "tel:+919800000001");
  await expect(channels.getByRole("heading", { name: "WhatsApp" })).toBeVisible();
  await expect(channels.getByRole("link", { name: "+91 98000 00002" })).toHaveAttribute("href", "https://wa.me/919800000002");
  await expect(page.getByText("Fixture hours: Mon to Fri, 9 AM to 6 PM")).toBeVisible();
  await expect(page.getByText("Fixture Street 1")).toBeVisible();
});

test("Catering pricing shows the trial and the priced plans from Ops, and no plan without a price", async ({ page }) => {
  await page.goto("/caterly/");
  const pricing = page.locator("section", { has: page.getByRole("heading", { name: "Simple plans for growing caterers" }) });
  await expect(pricing.getByRole("heading", { level: 3 })).toHaveText(["Free Trial", "Fixture Basic", "Fixture Plus"]);
  await expect(pricing).toContainText("for 14 days");
  await expect(pricing).toContainText("GST (18%) is added at checkout");
  const basic = pricing.locator("div.lift", { has: page.getByRole("heading", { name: "Fixture Basic" }) });
  await expect(basic).toContainText("₹1,500");
  await expect(basic).toContainText("or ₹15,000 a year + GST, which saves ₹3,000");
  await expect(basic).toContainText("Fixture basic text.");
  await expect(basic).toContainText("Fixture feature A");
  await expect(basic).toContainText("Fixture feature B");
  const plus = pricing.locator("div.lift", { has: page.getByRole("heading", { name: "Fixture Plus" }) });
  await expect(plus).toContainText("₹4,999");
  await expect(plus).not.toContainText("a year");
  await expect(pricing).not.toContainText("Fixture Hidden");
  // Only the plan Ops marks featured carries the badge; the trial and the other paid plan do not.
  await expect(pricing.getByText("Most popular")).toHaveCount(1);
  await expect(plus.getByText("Most popular")).toBeVisible();
  await expect(basic.getByText("Most popular")).toHaveCount(0);
  await expect(pricing).not.toContainText("Premium"); // the repo's own typed-in Premium card must not leak into an Ops-fed build
});

test("the pricing offers in the page data follow the Ops plans", async ({ page }) => {
  await page.goto("/caterly/");
  const offers = await page.evaluate(() => {
    const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent ?? "{}"));
    return (ld.find((d) => d["@type"] === "SoftwareApplication")?.offers ?? []).map((o: { name: string; price: string }) => `${o.name}=${o.price}`);
  });
  expect(offers).toEqual(["Free Trial=0", "Fixture Basic (monthly)=1500", "Fixture Plus (monthly)=4999"]);
});

test("the pricing cards fit a phone: one column, nothing wider than the screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/caterly/");
  const pricing = page.locator("#pricing");
  await pricing.scrollIntoViewIfNeeded();
  const cards = pricing.getByRole("heading", { level: 3 });
  await expect(cards).toHaveCount(3);
  const lefts = await cards.evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().left))).size);
  expect(lefts).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("the blog and What's new come from the Ops content too", async ({ page }) => {
  await page.goto("/blog/");
  await expect(page.getByRole("link", { name: /Fixture post/ })).toBeVisible();
  await page.goto("/whats-new/");
  await expect(page.getByRole("heading", { name: "Fixture release" })).toBeVisible();
});

test.describe("scripts: what Ops saved runs by kind, in its place, and only after the visitor chooses", () => {
  type W = { __fixtureAnalytics?: number; __fixtureMarketing?: number; __fixtureOff?: number; __where?: string[] };
  const read = <K extends keyof W>(page: import("@playwright/test").Page, key: K) => page.evaluate((k) => (window as unknown as W)[k as keyof W] ?? 0, key);
  const cookie = (page: import("@playwright/test").Page, name: string) => page.evaluate((n) => document.cookie.includes(`${n}=1`), name);

  test("the notice names each tool by kind, essential scripts already ran in their places, nothing else did", async ({ page }) => {
    await page.goto("/");
    const notice = page.getByTestId("cookie-notice");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("Fixture Analytics (counts visits)");
    await expect(notice).toContainText("Fixture Pixel (measures our adverts)");
    await expect(notice).not.toContainText("Fixture Off");
    await expect(notice).not.toContainText("Fixture head");
    // Head, start of body and footer each ran where the box said.
    await expect.poll(() => page.evaluate(() => [...((window as unknown as W).__where ?? [])].sort())).toEqual(["body:true", "footer:true", "head:HEAD"]);
    expect(await read(page, "__fixtureAnalytics")).toBe(0);
    expect(await read(page, "__fixtureMarketing")).toBe(0);
    expect(await read(page, "__fixtureOff")).toBe(0);
  });

  test("Accept all runs both kinds in their places, is remembered, and the switched-off script never runs", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("cookie-accept").click();
    await expect(page.getByTestId("cookie-notice")).toHaveCount(0);
    await expect.poll(() => read(page, "__fixtureAnalytics")).toBe(1);
    await expect.poll(() => read(page, "__fixtureMarketing")).toBe(1);
    expect(await cookie(page, "_ga_fixture")).toBe(true);
    expect(await cookie(page, "_fbp_fixture")).toBe(true);
    // The pixel's <noscript> block is not run: no image appears.
    await expect(page.locator("img[src*='example.test']")).toHaveCount(0);
    expect(await read(page, "__fixtureOff")).toBe(0);

    await page.goto("/about/");
    await expect(page.getByTestId("cookie-notice")).toHaveCount(0);
    await expect.poll(() => read(page, "__fixtureAnalytics")).toBe(1);
    await expect.poll(() => read(page, "__fixtureMarketing")).toBe(1);
  });

  test("a visitor can accept analytics and decline marketing", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("cookie-analytics").check();
    await page.getByTestId("cookie-save").click();
    await expect(page.getByTestId("cookie-notice")).toHaveCount(0);
    await expect.poll(() => read(page, "__fixtureAnalytics")).toBe(1);
    expect(await read(page, "__fixtureMarketing")).toBe(0);
    expect(await cookie(page, "_fbp_fixture")).toBe(false);
    await page.goto("/contact/");
    await expect(page.getByTestId("cookie-notice")).toHaveCount(0);
    await expect.poll(() => read(page, "__fixtureAnalytics")).toBe(1);
    expect(await read(page, "__fixtureMarketing")).toBe(0);
  });

  test("Decline all runs nothing, is remembered, and Cookie settings in the footer asks again", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("cookie-decline").click();
    await expect(page.getByTestId("cookie-notice")).toHaveCount(0);
    expect(await read(page, "__fixtureAnalytics")).toBe(0);
    expect(await read(page, "__fixtureMarketing")).toBe(0);

    await page.goto("/contact/");
    await expect(page.getByTestId("cookie-notice")).toHaveCount(0);
    expect(await read(page, "__fixtureAnalytics")).toBe(0);

    await page.getByTestId("cookie-settings").click();
    await expect(page.getByTestId("cookie-notice")).toBeVisible();
    await page.getByTestId("cookie-accept").click();
    await expect.poll(() => read(page, "__fixtureMarketing")).toBe(1);
  });

  test("changing from Accept to Decline removes both tools' cookies and stops their scripts", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("cookie-accept").click();
    await expect.poll(() => cookie(page, "_ga_fixture")).toBe(true);
    await expect.poll(() => cookie(page, "_fbp_fixture")).toBe(true);
    await page.getByTestId("cookie-settings").click();
    await page.getByTestId("cookie-decline").click();
    await page.waitForLoadState("load");
    await expect.poll(() => cookie(page, "_ga_fixture")).toBe(false);
    expect(await cookie(page, "_fbp_fixture")).toBe(false);
    expect(await read(page, "__fixtureAnalytics")).toBe(0);
    expect(await read(page, "__fixtureMarketing")).toBe(0);
  });

  test("the Cookie Policy lists the same tools, and not the one that is off or the essential ones", async ({ page }) => {
    await page.goto("/cookie-policy/");
    const row = (name: string) => page.getByRole("row", { name });
    await expect(row(/Fixture Analytics.*Analytics.*counts visits.*_ga/)).toBeVisible();
    await expect(row(/Fixture Pixel.*Marketing.*measures our adverts.*_fbp/)).toBeVisible();
    await expect(page.getByRole("cell", { name: "Fixture Off" })).toHaveCount(0);
    await expect(page.getByRole("cell", { name: "Fixture head" })).toHaveCount(0);
  });
});
