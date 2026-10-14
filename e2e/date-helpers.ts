import { expect, type Locator, type Page } from "@playwright/test";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** YYYY-MM-DD for today plus `offsetDays` (local time, like the pickers). */
export const isoDay = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Opens one of the design system's calendar pickers (DateRangePicker) and clicks the day. */
export async function pickDate(page: Page, trigger: Locator, iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  await trigger.click();
  const popover = page.locator("[data-slot=popover-content]").last();
  const header = `${MONTHS[m - 1]} ${y}`;
  for (let i = 0; i < 36 && !(await popover.getByText(header, { exact: true }).isVisible()); i++) {
    const shown = (await popover.locator("span.text-sm.font-medium").first().innerText()).split(" ");
    const shownIndex = Number(shown[1]) * 12 + MONTHS.indexOf(shown[0]);
    await popover.getByRole("button", { name: shownIndex < y * 12 + (m - 1) ? "Next month" : "Previous month" }).click();
  }
  await popover.getByRole("button", { name: String(d), exact: true }).click();
  await expect(popover).toBeHidden();
}

/** Opens the picker and returns whether a day is greyed out (cannot be picked). */
export async function dayDisabled(page: Page, trigger: Locator, iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  await trigger.click();
  const popover = page.locator("[data-slot=popover-content]").last();
  for (let i = 0; i < 36 && !(await popover.getByText(`${MONTHS[m - 1]} ${y}`, { exact: true }).isVisible()); i++) {
    const shown = (await popover.locator("span.text-sm.font-medium").first().innerText()).split(" ");
    const shownIndex = Number(shown[1]) * 12 + MONTHS.indexOf(shown[0]);
    await popover.getByRole("button", { name: shownIndex < y * 12 + (m - 1) ? "Next month" : "Previous month" }).click();
  }
  const disabled = await popover.getByRole("button", { name: String(d), exact: true }).isDisabled();
  await page.keyboard.press("Escape");
  return disabled;
}
