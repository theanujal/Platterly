import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { UsageNote } from "./usage-note";

const now = new Date("2026-10-20T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000);
const html = (reported: Date | null) => renderToStaticMarkup(createElement(UsageNote, { lastActiveAt: hoursAgo(1), usageReportedAt: reported, now }));

describe("usage note", () => {
  it("says when the totals were taken and how often they refresh", () => {
    const out = html(hoursAgo(5));
    expect(out).toContain("Totals as of");
    expect(out).toContain("Refreshed within about a minute of any change, and at least once a day.");
    expect(out).not.toContain("text-warning");
  });

  it("turns to a warning once the last report is older than 26 hours", () => {
    expect(html(hoursAgo(25))).not.toContain("text-warning");
    const out = html(hoursAgo(27));
    expect(out).toContain("text-warning");
    expect(out).toContain("Usage not reported since");
    expect(out).not.toContain("Refreshed within");
  });

  it("says nothing was reported yet when there is no report", () => {
    expect(html(null)).toContain("Usage has not been reported yet.");
  });
});
