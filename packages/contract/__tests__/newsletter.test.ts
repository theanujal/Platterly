import { describe, expect, it } from "vitest";
import { parseNewsletterIssue, parseNewsletterResult, parseNewsletterTest } from "../src/newsletter";

describe("newsletter contract", () => {
  it("accepts an issue and trims the subject", () => {
    expect(parseNewsletterIssue({ issueId: "n1", subject: "  Hello  ", body: "# Hi" })).toEqual({ ok: true, value: { issueId: "n1", subject: "Hello", body: "# Hi" } });
  });
  it("refuses a missing id, an empty subject, a non-text or oversized body", () => {
    for (const bad of [null, {}, { issueId: "", subject: "s", body: "" }, { issueId: "n", subject: " ", body: "" }, { issueId: "n", subject: "s", body: 5 }, { issueId: "n", subject: "s", body: "x".repeat(100_001) }]) {
      expect(parseNewsletterIssue(bad).ok).toBe(false);
    }
  });
  it("accepts a result and refuses bad numbers or a missing done flag", () => {
    expect(parseNewsletterResult({ issueId: "n1", kind: "send", sent: 3, failed: 0, done: false }).ok).toBe(true);
    for (const bad of [null, { issueId: "n1", kind: "send", sent: -1, failed: 0, done: true }, { issueId: "n1", kind: "send", sent: 1.5, failed: 0, done: true }, { issueId: "n1", kind: "send", sent: 1, failed: 0 }, { issueId: "n1", kind: "other", sent: 1, failed: 0, done: true }, { issueId: "", kind: "send", sent: 1, failed: 0, done: true }]) {
      expect(parseNewsletterResult(bad).ok).toBe(false);
    }
  });
  it("a test request needs an email address to send to", () => {
    expect(parseNewsletterTest({ issueId: "n", subject: "s", body: "b", to: "staff@platterly.in" }).ok).toBe(true);
    expect(parseNewsletterTest({ issueId: "n", subject: "s", body: "b", to: "not an email" }).ok).toBe(false);
    expect(parseNewsletterTest({ issueId: "n", subject: "s", body: "b" }).ok).toBe(false);
  });
});
