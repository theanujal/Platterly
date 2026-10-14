import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Guards the colour pass of 2026-10-14 (all but the brand orange): the :root tokens in globals.css must keep meeting WCAG AA (4.5:1 text, 3:1 field edges). */
const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const root = css.slice(css.indexOf(":root {"), css.indexOf("@layer base"));
const token = (name: string) => {
  const match = root.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`token --${name} not found`);
  return match[1];
};
const luminance = (hex: string) => {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("colour tokens meet WCAG AA", () => {
  const textOn: [string, string][] = [
    ["foreground", "background"],
    ["muted-foreground", "background"],
    ["muted-foreground", "muted"],
    ["muted-foreground", "accent"], // the orange-50 sidebar and public background
    // Not checked: white on --primary and orange text. The brand orange is the bright #ff6900 (about 2.9:1), kept on purpose by AJ.
    ["destructive", "background"],
    ["success", "background"],
    ["warning", "background"],
    ["info", "background"],
    ["accent-foreground", "accent"],
  ];
  it.each(textOn)("%s on %s is at least 4.5:1", (fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });
  it("field and checkbox edges (--input) are at least 3:1 on white", () => {
    expect(contrast(token("input"), token("background"))).toBeGreaterThanOrEqual(3);
  });
});
