import { expect, type Page } from "@playwright/test";

// Shared by the Account specs that need a really signed-in person: registers a new person through the pages, reads the 6-digit code from the local mail
// sink (port 3600) and signs in. `@auth.test` people are removed by apps/platform/scripts/clean-test-people.mjs --apply.
export const SINK = "http://localhost:3600";
export const PASSWORD = "correct horse 7";
let counter = 0;
export const newEmail = () => `acct-${Date.now()}-${counter++}@auth.test`;

/** Text typed before the page is interactive is lost when it becomes interactive, so every fill waits for the page's ready marker first. */
export async function fill(page: Page, label: string, value: string, options?: { exact?: boolean }) {
  await page.locator('[data-hydrated="true"]').waitFor();
  await page.getByLabel(label, label === "Password" ? { exact: true, ...options } : options).fill(value);
}

/** The newest 6-digit code mailed to this address, from the sink (retries while the background send finishes). `after` ignores older messages. */
export async function codeFor(page: Page, to: string, after = ""): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const messages = (await (await page.request.get(`${SINK}/api/messages`)).json()) as { to: string[]; subject: string; receivedAt: string }[];
    const mine = messages.filter((m) => m.to.includes(to) && m.receivedAt > after).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0];
    const code = mine?.subject.match(/\b(\d{6})\b/)?.[1];
    if (code) return code;
    await page.waitForTimeout(250);
  }
  throw new Error(`no code arrived for ${to}`);
}

export async function registerAndSignIn(page: Page, to: string, startPath = "/", name = "E2E Person") {
  await page.goto(startPath);
  await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
  await page.getByRole("link", { name: "Create an account" }).click();
  await fill(page, "First name", (name).split(" ")[0]);
  await fill(page, "Last name", (name).split(" ").slice(1).join(" ") || "Tester");
  await fill(page, "Phone", "9800000123");
  await fill(page, "Confirm password", PASSWORD);
  await fill(page, "Email", to);
  await fill(page, "Password", PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await fill(page, "Verification code", await codeFor(page, to));
  await page.getByRole("button", { name: "Verify email" }).click();
  await expect(page.getByText("Your email is verified. You can sign in now.")).toBeVisible();
  await fill(page, "Password", PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
}
