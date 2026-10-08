import { test, expect, type Page } from "@playwright/test";

const APP = "https://catering.platterly.in/";

async function loadLazyImages(page: Page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 80));
    }
  });
}

test("home: the headline, the Products menu, and the calls to action", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Software built for the food business.");
  await expect(page).toHaveTitle(/Platterly/);
  // Sign in and Get Started Free both open the app's sign-in and sign-up screen
  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: "Log in" })).toHaveAttribute("href", APP);
  await expect(header.getByRole("link", { name: "Get started for free" })).toHaveAttribute("href", APP);
  // Products opens a menu with Catering, which goes to the Catering page
  await header.getByRole("button", { name: "Product" }).click();
  await header.getByRole("link", { name: /Catering by Platterly/ }).click();
  await expect(page).toHaveURL(/\/catering\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Run your catering business without the chaos.");
});

test("catering: every section, the pricing figures and the ten questions", async ({ page }) => {
  await page.goto("/catering/");
  for (const heading of [
    "Everything your catering team needs.",
    "Easy and flexible catering management",
    "Built for the day the kitchen is busiest.",
    "Built for different catering businesses.",
    "The Platterly platform",
    "Simple plans for growing caterers",
    "Frequently asked questions.",
    "Your next event shouldn't start with another spreadsheet.",
  ]) {
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
  // the product page opens on a full-width gradient hero with the product's name, "See plans" and a demo button
  await expect(page.getByRole("link", { name: "See plans" })).toHaveAttribute("href", "#pricing");
  // how it works: five numbered cards in a row that scrolls sideways
  const how = page.getByRole("list", { name: /How it works/ });
  await expect(how.getByRole("listitem")).toHaveCount(5);
  await expect(how).toContainText("01 — Add the customer and the event");
  await expect(how).toContainText("05 — Deliver, then get paid");
  await page.getByRole("button", { name: "Next steps" }).click();
  // pricing as it stands in the product
  const pricing = page.locator("section", { has: page.getByRole("heading", { name: "Simple plans for growing caterers" }) });
  await expect(pricing).toContainText("₹3,000");
  await expect(pricing).toContainText("₹33,000 a year");
  await expect(pricing).toContainText("GST");
  // the ten questions open and close
  const questions = page.locator("details");
  await expect(questions).toHaveCount(10);
  await questions.first().locator("summary").click();
  await expect(questions.first()).toHaveAttribute("open", "");
  await expect(page.getByRole("link", { name: "Start for free" }).first()).toHaveAttribute("href", APP);
});

test("the people photos and the gradient load, and each feature shows a small designed card, not a whole-page screenshot", async ({ page, request }) => {
  await page.goto("/");
  await loadLazyImages(page);
  const photos = page.locator("#final").locator("xpath=ancestor::section").locator("img");
  await expect(photos).toHaveCount(4);
  for (const photo of await photos.all()) {
    await expect(photo).toHaveJSProperty("complete", true);
    expect(await photo.evaluate((el: HTMLImageElement) => el.naturalHeight)).toBeGreaterThan(600);
    expect((await photo.getAttribute("alt"))?.length ?? 0).toBeGreaterThan(10);
  }
  expect((await request.get("/media/gradient.webp")).ok()).toBe(true);
  // the product visuals are designed cards (title plus a few rows), with no browser screenshots left in the page
  await expect(page.locator("main img[src*='/media/'][src*='orders'], main img[src*='dashboard']")).toHaveCount(0);
  await page.goto("/catering/");
  const chapter = page.locator("section", { has: page.locator("#features-title") });
  await chapter.scrollIntoViewIfNeeded();
  await expect(chapter.getByText("October").locator("visible=true").first()).toBeVisible();
  await expect(page.locator("main img[src*='/media/dashboard'], main img[src*='/media/orders']")).toHaveCount(0);
});

test("the policies, About and the new pages are in the footer and each has one heading", async ({ page }) => {
  const footer = () => page.getByRole("contentinfo");
  for (const [link, heading, url] of [
    ["Privacy Policy", "Privacy Policy", /\/privacy\/$/],
    ["Terms and Conditions", "Terms and Conditions", /\/terms\/$/],
    ["Cancellation and Refund", "Cancellation and Refund Policy", /\/refund\/$/],
    ["Cookie Policy", "Cookie Policy", /\/cookie-policy\/$/],
    ["Shipping and Delivery", "Shipping and Delivery", /\/shipping-and-delivery\/$/],
    ["Security", "Security", /\/security\/$/],
    ["About Platterly", "Software for the work behind the food", /\/about\/$/],
    ["Blog", "Ideas for running a catering business", /\/blog\/$/],
    ["What's new", "What we have shipped", /\/whats-new\/$/],
    ["Upcoming features", "What we are working towards", /\/upcoming\/$/],
    ["Contact us", "We are here to help", /\/contact\/$/],
    ["Talk to us", "Let's see how Platterly fits your kitchen", /\/talk-to-us\/$/],
  ] as const) {
    await page.goto("/");
    await footer().getByRole("link", { name: link, exact: true }).click();
    await expect(page).toHaveURL(url);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
  }
  await page.goto("/refund/");
  await expect(page.getByText("Plans do not renew automatically").first()).toBeVisible();
});

test("policy pages: a contents list that follows you, the company named, and the no-refund rule", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/terms/");
  const toc = page.getByRole("navigation", { name: "On this page" });
  await expect(toc.getByRole("link").first()).toBeVisible();
  expect(await toc.getByRole("link").count()).toBeGreaterThan(5);
  await toc.getByRole("link").nth(2).click();
  await expect(page).toHaveURL(/#/);
  await expect(page.getByText("Fragen Network Private Limited").first()).toBeVisible();
  await expect(page.getByText("The courts at Bangalore, India have exclusive jurisdiction")).toBeVisible();
  await page.goto("/refund/");
  await expect(page.getByText("Payments for Platterly plans are not refundable.")).toBeVisible();
  await page.goto("/cookie-policy/");
  await expect(page.getByRole("table").first()).toBeVisible();
  await expect(page.getByText("does not use advertising, analytics or tracking cookies")).toBeVisible();
});

test("search files: the sitemap lists every page and robots allows the site", async ({ request }) => {
  const sitemap = await (await request.get("/sitemap.xml")).text();
  for (const path of ["", "catering/", "about/", "talk-to-us/", "contact/", "blog/", "whats-new/", "upcoming/", "privacy/", "terms/", "refund/", "cookie-policy/", "shipping-and-delivery/", "security/", "blog/plan-a-multi-day-wedding-menu/"]) expect(sitemap).toContain(`<loc>https://platterly.in/${path}</loc>`);
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toMatch(/Allow: \//);
  expect(robots).toContain("Sitemap: https://platterly.in/sitemap.xml");
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test("the menu opens, nothing scrolls sideways, and the buttons fill the width", async ({ page }) => {
    for (const path of ["/", "/catering/", "/about/", "/privacy/", "/terms/", "/refund/"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0);
    }
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    const mobile = page.locator("#mobile-menu");
    await expect(mobile.getByRole("link", { name: "Catering by Platterly" })).toBeVisible();
    await expect(mobile.getByRole("link", { name: "Get started for free" })).toHaveAttribute("href", APP);
    await mobile.getByRole("link", { name: "About Platterly" }).click();
    await expect(page).toHaveURL(/\/about\/$/);
    await expect(page.locator("#mobile-menu")).toHaveCount(0); // closes on navigation
    // The main buttons in the hero are full width
    await page.goto("/");
    const box = await page.getByRole("main").getByRole("link", { name: "Explore Catering" }).first().boundingBox();
    expect(box!.width).toBeGreaterThan(280);
  });
});

test("Talk to us: the form checks every field, ignores robots, and a valid request opens a ready-written email", async ({ page }) => {
  await page.goto("/talk-to-us/");
  await expect(page.getByRole("heading", { name: "What happens next" })).toBeVisible();
  const form = page.getByRole("form", { name: "Talk to us" });
  await form.getByRole("button", { name: "Request a call" }).click();
  await expect(form.getByText("Please enter your name.")).toBeVisible();
  await expect(form.getByText("Please enter a valid email address.")).toBeVisible();
  await expect(form.getByText("Please enter a valid phone number.")).toBeVisible();
  await expect(form.getByText("Please choose the kind of business you run.")).toBeVisible();
  await form.getByLabel("Your name").fill("Asha Rao");
  await form.getByLabel("Email").fill("asha@");
  await form.getByLabel("Phone number").fill("123");
  await form.getByLabel("What do you run?").selectOption("Wedding caterer");
  await form.getByRole("button", { name: "Request a call" }).click();
  await expect(form.getByText("Please enter a valid email address.")).toBeVisible();
  await expect(form.getByText("Please enter a valid phone number.")).toBeVisible();
  await expect(form.getByText("Please enter your name.")).toHaveCount(0);
  await form.getByLabel("Email").fill("asha@example.com");
  await form.getByLabel("Phone number").fill("+91 98765 43210");
  await form.getByRole("button", { name: "Request a call" }).click();
  const done = page.getByRole("status");
  await expect(done).toContainText("send the email");
  await expect(done).toContainText("hello@platterly.in");
});

test("Talk to us: a robot that fills the hidden field is thanked and nothing is sent", async ({ page }) => {
  await page.goto("/talk-to-us/");
  const form = page.getByRole("form", { name: "Talk to us" });
  await form.getByLabel("Your name").fill("Robot Rao");
  await form.getByLabel("Email").fill("robot@example.com");
  await form.getByLabel("Phone number").fill("+91 98765 43210");
  await form.getByLabel("What do you run?").selectOption("Other food business");
  await form.locator("input[name='website']").evaluate((el: HTMLInputElement) => { el.value = "https://spam.example"; });
  await form.getByRole("button", { name: "Request a call" }).click();
  await expect(page.getByRole("status")).toContainText("Thank you, we have it.");
});

test("Contact us: channels, only the ones we have, a form that needs a subject and a message, and a short FAQ", async ({ page }) => {
  await page.goto("/contact/");
  const channels = page.getByRole("list").filter({ has: page.getByRole("heading", { name: "Email" }) });
  await expect(channels.getByRole("link", { name: "hello@platterly.in" })).toHaveAttribute("href", "mailto:hello@platterly.in");
  await expect(page.getByRole("heading", { name: "Phone" })).toHaveCount(0); // nothing is shown until a phone number is set
  await expect(page.getByRole("heading", { name: "WhatsApp" })).toHaveCount(0);
  const form = page.getByRole("form", { name: "Contact us" });
  await form.getByRole("button", { name: "Send message" }).click();
  await expect(form.getByText("Please choose what this is about.")).toBeVisible();
  await expect(form.getByText("Please tell us a little more (at least a sentence).")).toBeVisible();
  await form.getByLabel("Your name").fill("Asha Rao");
  await form.getByLabel("Email").fill("asha@example.com");
  await form.getByLabel("What is this about?").selectOption("Billing or an invoice");
  await form.getByLabel("Your message").fill("Could you resend my last invoice, please?");
  await form.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("status")).toContainText("hello@platterly.in");
  expect(await page.locator("details").count()).toBe(4);
});

test("blog: a list with topic filters, an article with its own page, and a feed", async ({ page, request }) => {
  await page.goto("/blog/");
  const cards = page.getByRole("list").filter({ has: page.getByRole("heading", { level: 2 }) }).locator("> li");
  await expect(cards).toHaveCount(4);
  await page.getByRole("button", { name: "Payments", exact: true }).click();
  await expect(cards).toHaveCount(1);
  await page.getByRole("button", { name: "All" }).click();
  await page.getByRole("link", { name: /How to plan a multi-day wedding menu/ }).click();
  await expect(page).toHaveURL(/\/blog\/plan-a-multi-day-wedding-menu\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("How to plan a multi-day wedding menu without losing track");
  await expect(page.getByRole("heading", { name: "Count adults and children separately" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Get started for free" }).last()).toBeVisible();
  const rss = await (await request.get("/blog/rss.xml")).text();
  expect(rss).toContain("<title>How to plan a multi-day wedding menu without losing track</title>");
  const missing = await request.get("/blog/not-a-post/");
  expect(missing.status()).toBe(404);
});

test("What's new lists what has shipped by month, and Upcoming shows the roadmap in three columns", async ({ page }) => {
  await page.goto("/whats-new/");
  await expect(page.getByRole("heading", { name: "October 2026" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "September 2026" })).toBeVisible();
  expect(await page.locator("article").count()).toBeGreaterThanOrEqual(8);
  await page.goto("/upcoming/");
  for (const column of ["Planned", "In progress", "In beta"]) await expect(page.getByRole("region", { name: column })).toBeVisible();
  await expect(page.getByRole("region", { name: "Planned" }).getByText("WhatsApp messages from Platterly")).toBeVisible();
  await expect(page.getByRole("link", { name: "Suggest a feature" })).toHaveAttribute("href", "/contact/");
});

test("the announcement bar shows the notice, closes, and stays closed on every page", async ({ page }) => {
  await page.goto("/");
  const bar = page.getByText("Introducing Catering by Platterly, built to run your catering business from enquiry to event.");
  await expect(bar).toBeVisible();
  await page.getByRole("button", { name: "Close announcement" }).click();
  await expect(bar).toHaveCount(0);
  await page.goto("/about/");
  await expect(bar).toHaveCount(0);
  await page.reload();
  await expect(bar).toHaveCount(0);
});

test("choosing Catering from the Product menu loads the page at the top, from the top bar and from the floating bar", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const scroll of [0, 3000]) {
    await page.goto("/");
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), scroll);
    const bar = scroll ? page.locator(".floating-nav") : page.getByRole("banner");
    await bar.getByRole("button", { name: "Product" }).hover();
    await bar.getByRole("link", { name: /Catering by Platterly/ }).click();
    await expect(page).toHaveURL(/\/catering\/$/);
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY)), { timeout: 5000 }).toBeLessThanOrEqual(1);
    await page.waitForTimeout(700); // and it stays there
    expect(await page.evaluate(() => Math.round(window.scrollY))).toBeLessThanOrEqual(1);
  }
});

test("the four step cards have gradient panels of exactly the same height", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const cards = page.locator("ol.mt-14 > li");
  await cards.first().scrollIntoViewIfNeeded();
  const heights = await cards.evaluateAll((els) => els.map((el) => Math.round(el.querySelector("[class*='cw-']")!.getBoundingClientRect().height)));
  expect(new Set(heights).size).toBe(1);
  const tops = await cards.evaluateAll((els) => els.map((el) => Math.round(el.querySelector("[class*='cw-']")!.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
});

test("Calendly's look: midnight buttons, one palette on every page, and the product colour only on the product's own icon", async ({ page, request }) => {
  const MIDNIGHT = "rgb(7, 26, 49)";
  const ORANGE = "rgb(255, 105, 0)";
  const token = (locator: ReturnType<Page["locator"]>, name: string) => locator.evaluate((el, n) => getComputedStyle(el).getPropertyValue(n).trim(), name);
  await page.goto("/");
  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: "Get started for free" })).toHaveCSS("background-color", MIDNIGHT);
  await expect(page.getByRole("main").getByRole("link", { name: "Get started for free" }).first()).toHaveCSS("background-color", MIDNIGHT);
  await expect(header.getByRole("link", { name: "Get started for free" })).toHaveCSS("border-radius", "8px");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCSS("font-size", "72px");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCSS("font-weight", "500");
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(252, 251, 248)");
  expect(await (await request.get("/platterly-mark.svg")).text()).toContain("#f26a21"); // the Platterly mark is its own orange
  // the Product menu shows Catering on a tile in the app's own orange
  await header.getByRole("button", { name: "Product" }).click();
  await expect(header.getByRole("link", { name: /Catering by Platterly/ }).locator("span").first()).toHaveCSS("background-color", ORANGE);
  // the product page keeps the main palette: midnight buttons and the same orange family; the tile is the app's #ff6900
  await page.goto("/catering/");
  expect(await token(page.locator("main"), "--color-accent")).toBe("#ffb067");
  await expect(page.getByRole("main").getByRole("link", { name: "See plans" }).first()).toHaveCSS("background-color", MIDNIGHT);
  await expect(page.locator("main [style*='--product']").first().locator("span").first()).toHaveCSS("background-color", ORANGE);
  await page.goto("/talk-to-us/");
  await expect(page.getByRole("button", { name: "Request a call" })).toHaveCSS("background-color", MIDNIGHT);
});

test("width: the panels and the footer fill the screen, 24px in from each edge, at any width", async ({ page }) => {
  for (const width of [1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    const panel = await page.locator('section[aria-labelledby="hero"] > div').boundingBox();
    expect(Math.round(panel!.x), `panel left at ${width}`).toBe(24);
    expect(Math.round(panel!.width), `panel width at ${width}`).toBe(width - 48);
    const footer = await page.getByRole("contentinfo").locator("> div").boundingBox();
    expect(Math.round(footer!.width), `footer width at ${width}`).toBe(width - 48);
    const logo = await page.getByRole("banner").getByRole("link", { name: "Platterly home" }).boundingBox();
    expect(Math.round(logo!.x), `logo left at ${width}`).toBe(48);
  }
});

test("menu: Product and Resources only, with Discover and Support inside Resources", async ({ page }) => {
  await page.goto("/");
  const header = page.getByRole("banner");
  await expect(header.getByRole("button", { name: "Solutions" })).toHaveCount(0);
  await expect(header.getByRole("link", { name: "Pricing" })).toHaveCount(0);
  await header.getByRole("button", { name: "Resources" }).click();
  await expect(header.getByText("Discover", { exact: true })).toBeVisible();
  await expect(header.getByText("Support", { exact: true })).toBeVisible();
  await expect(header.getByRole("link", { name: "About Platterly" })).toBeVisible();
  await expect(header.getByRole("link", { name: "Contact us" })).toHaveAttribute("href", "/contact/");
  await expect(header.getByRole("link", { name: "Blog" })).toHaveAttribute("href", "/blog/");
});

test("header: the page's own bar scrolls away and a floating bar takes over once you have scrolled", async ({ page }) => {
  await page.goto("/about/");
  const bar = page.getByRole("banner");
  await expect(bar).toHaveCSS("position", "relative");
  const floating = page.locator(".floating-nav");
  await expect(floating).toHaveCSS("opacity", "0");
  await page.evaluate(() => window.scrollTo({ top: 600, behavior: "instant" }));
  await expect(floating).toHaveCSS("opacity", "1");
  const box = await floating.locator("> div").boundingBox();
  expect(Math.round(box!.y)).toBe(24);
  expect(Math.round(box!.x)).toBe(48);
  expect(Math.round(box!.height)).toBe(72);
  await expect(floating.getByRole("link", { name: "Get started for free" })).toHaveCSS("background-color", "rgb(7, 26, 49)");
});

test("the product scene is one card: it grows to fill the screen, pins, says what Catering is, and lets go", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const scene = page.locator(".scene-pinned");
  await expect(scene).toBeVisible();
  await expect(page.locator(".scene-static")).toBeHidden();
  const height = await scene.evaluate((el) => (el as HTMLElement).offsetHeight);
  expect(height).toBeGreaterThan(1200);
  expect(height).toBeLessThan(1600); // one card: a short hold, not a long walk through steps
  await page.evaluate(() => {
    const el = document.querySelector(".scene-pinned")!;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 24 + 40, behavior: "instant" });
  });
  await expect(page.locator("html")).toHaveAttribute("data-pinned", "true");
  await expect(scene.getByRole("heading", { name: "Run your catering business from one place." })).toBeVisible();
  // no steps: no step names, no tabs
  for (const step of ["Orders", "Menu planning", "Kitchen", "Payments"]) await expect(scene.getByRole("button", { name: step })).toHaveCount(0);
  await expect(page.getByRole("tablist")).toHaveCount(0);
  // the Catering icon wears the product's orange; the card links to the product page
  await expect(scene.getByRole("group", { name: "Products" }).locator("span").first().locator("span").first()).toHaveCSS("background-color", "rgb(255, 105, 0)");
  await expect(scene.getByRole("link", { name: /Learn more/ })).toHaveAttribute("href", "/catering/");
  // the floating bar steps aside while it is pinned
  await expect(page.locator(".floating-nav")).toHaveCSS("opacity", "0");
  // scrolling on lets go of it
  await page.evaluate(() => window.scrollBy({ top: window.innerHeight * 1.2, behavior: "instant" }));
  await expect(page.locator("html")).toHaveAttribute("data-pinned", "false");
});

test("without motion the same card shows in a plain panel, with no pinning", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator(".scene-pinned")).toBeHidden();
  await expect(page.locator(".scene-static").getByRole("heading", { name: "Run your catering business from one place." })).toBeVisible();
  await expect(page.locator("html")).not.toHaveAttribute("data-pinned", "true");
  await context.close();
});

test("the four step cards are an accordion: hover one and it widens while the others fold back", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const cards = page.locator("ol.mt-14 > li");
  await cards.first().scrollIntoViewIfNeeded();
  const widths = async () => Promise.all((await cards.all()).map(async (c) => Math.round((await c.boundingBox())!.width)));
  await expect.poll(async () => (await widths())[0]).toBeGreaterThan((await widths())[1]);
  const before = await widths();
  await cards.nth(2).hover();
  await expect.poll(async () => (await widths())[2]).toBeGreaterThan(before[2] + 60);
  const after = await widths();
  expect(after[0]).toBeLessThan(before[0]);
  expect(after[2]).toBeGreaterThan(after[1]);
  // regression: a card must stay visible after the hover re-renders it (its "revealed" class used to be wiped)
  for (const card of await cards.all()) await expect(card).toHaveCSS("opacity", "1");
  await expect(cards.nth(2).getByText("Pending, In Preparation, Ready")).toBeVisible();
  await cards.nth(0).hover();
  await expect.poll(async () => (await widths())[0]).toBeGreaterThan(after[0] + 60);
  for (const card of await cards.all()) await expect(card).toHaveCSS("opacity", "1");
});

test("home: a chapter dedicated to Catering, with arrows to the product page and an orange tile", async ({ page }) => {
  await page.goto("/");
  const chapter = page.locator("section", { has: page.locator("#catering-chapter") });
  await chapter.scrollIntoViewIfNeeded();
  await expect(chapter.getByRole("heading", { name: "A better way to run your catering business" })).toBeVisible();
  await expect(chapter.getByText("Catering by Platterly").first()).toBeVisible();
  await expect(chapter.getByRole("link", { name: /Learn more about/ }).first()).toHaveAttribute("href", /\/catering\//);
  await expect(chapter.locator("span[style*='--product']").first()).toHaveCSS("background-color", "rgb(255, 105, 0)");
  // one item is open at a time
  await chapter.getByRole("button", { name: "Payments and invoices" }).click();
  await expect(chapter.getByRole("button", { name: "Payments and invoices" })).toHaveAttribute("aria-expanded", "true");
  await expect(chapter.getByRole("button", { name: "Events and calendar" })).toHaveAttribute("aria-expanded", "false");
});

test("the closing band shows photo scenes that move on, and stands still for reduced motion", async ({ page, browser }) => {
  await page.goto("/");
  const band = page.locator("section", { has: page.locator("#final") });
  await band.scrollIntoViewIfNeeded();
  await expect(band.getByRole("heading", { name: "From the first enquiry to the final delivery" })).toBeVisible();
  const slides = band.locator("figure");
  await expect(slides).toHaveCount(4);
  for (const slide of await slides.all()) expect((await slide.getAttribute("aria-label"))?.length ?? 0).toBeGreaterThan(10);
  // each scene is a real person (a cut-out photo) with a state chip across the middle
  await expect(slides.first().locator("img")).toHaveAttribute("src", /\/media\/people\/\w+\.webp$/);
  const dots = band.getByRole("group", { name: "Choose a scene" }).getByRole("button");
  await expect(dots.first()).toHaveAttribute("aria-current", "true");
  await dots.nth(3).click();
  await expect(dots.nth(3)).toHaveAttribute("aria-current", "true");
  await expect(slides.nth(3).locator("figcaption")).toHaveText("Payment received");
  // it moves on by itself (the pointer is on the dots, not on the pictures)
  await expect(dots.first()).toHaveAttribute("aria-current", "true", { timeout: 9000 });

  const calm = await browser.newContext({ reducedMotion: "reduce" });
  const still = await calm.newPage();
  await still.goto("/");
  const stillBand = still.locator("section", { has: still.locator("#final") });
  await stillBand.scrollIntoViewIfNeeded();
  await still.waitForTimeout(6500);
  await expect(stillBand.getByRole("group", { name: "Choose a scene" }).getByRole("button").first()).toHaveAttribute("aria-current", "true");
  await calm.close();
});

test("the footer has Products, Discover and Support, and no Features group", async ({ page }) => {
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  for (const group of ["Products", "Discover", "Support"]) await expect(footer.getByRole("navigation", { name: group }).or(footer.getByText(group, { exact: true })).first()).toBeVisible();
  await expect(footer.getByText("Features", { exact: true })).toHaveCount(0);
  await expect(footer.getByText("Solutions")).toHaveCount(0);
  await expect(footer.getByText("Pricing")).toHaveCount(0);
});

test("the Catering feature list opens one feature at a time with its real screen", async ({ page }) => {
  await page.goto("/catering/");
  const section = page.locator("section", { has: page.getByRole("heading", { name: "Everything your catering team needs." }) });
  const events = section.getByRole("button", { name: "Events" });
  await expect(events).toHaveAttribute("aria-expanded", "true");
  await section.getByRole("button", { name: "Payments" }).click();
  await expect(section.getByRole("button", { name: "Payments" })).toHaveAttribute("aria-expanded", "true");
  await expect(events).toHaveAttribute("aria-expanded", "false");
  await expect(section.getByText("Track payment status and outstanding amounts.")).toBeVisible();
  await expect(section.getByText("Create invoice").locator("visible=true").first()).toBeVisible(); // its own small card, not a screenshot
});

test("motion: sections reveal on scroll, and reduced motion or no scripts show everything at once", async ({ page, browser }) => {
  await page.goto("/");
  const reveal = page.locator("#steps").locator("xpath=ancestor::div[contains(@class,'reveal')]").first();
  await expect(reveal).not.toHaveClass(/\bin\b/);
  await reveal.scrollIntoViewIfNeeded();
  await expect(reveal).toHaveClass(/\bin\b/);
  await expect(reveal).toHaveCSS("opacity", "1");

  const calm = await browser.newContext({ reducedMotion: "reduce" });
  const still = await calm.newPage();
  await still.goto("/");
  await expect(still.locator("#steps").locator("xpath=ancestor::div[contains(@class,'reveal')]").first()).toHaveCSS("opacity", "1");
  await calm.close();

  const bare = await browser.newContext({ javaScriptEnabled: false });
  const plain = await bare.newPage();
  await plain.goto("/catering/");
  await expect(plain.locator("#how")).toBeVisible();
  await expect(plain.locator(".reveal").first()).toHaveCSS("opacity", "1");
  await bare.close();
});
