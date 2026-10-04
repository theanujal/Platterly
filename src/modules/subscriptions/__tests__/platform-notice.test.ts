import { describe, it, expect, afterAll } from "vitest";
import { getActiveNotice, getPlatformNotice, savePlatformNotice, checkNoticeUrl } from "@/modules/subscriptions/platform-notice";

const ok = { enabled: true, title: "Diwali offer", message: "20% off yearly plans.", buttonLabel: "See plans", buttonUrl: "/subscribe" };

afterAll(async () => {
  await savePlatformNotice({ enabled: false, title: "", message: "", buttonLabel: "", buttonUrl: "" });
});

describe("Super Admin sidebar notice", () => {
  it("is off by default and shows nothing", async () => {
    await savePlatformNotice({ enabled: false, title: "", message: "", buttonLabel: "", buttonUrl: "" });
    expect(await getActiveNotice()).toBeNull();
    expect((await getPlatformNotice()).enabled).toBe(false);
  });

  it("when on, every kitchen gets the text and button; switching it off hides it again", async () => {
    await savePlatformNotice(ok);
    expect(await getActiveNotice()).toEqual({ title: "Diwali offer", message: "20% off yearly plans.", buttonLabel: "See plans", buttonUrl: "/subscribe" });
    await savePlatformNotice({ ...ok, enabled: false });
    expect(await getActiveNotice()).toBeNull();
  });

  it("keeps what was typed while it is off, so it can be switched on again", async () => {
    await savePlatformNotice({ ...ok, enabled: false });
    expect(await getPlatformNotice()).toMatchObject({ enabled: false, title: "Diwali offer", buttonUrl: "/subscribe" });
  });

  it("refuses an empty box, half a button, and a long text", async () => {
    await expect(savePlatformNotice({ ...ok, title: "", message: "" })).rejects.toThrow();
    await expect(savePlatformNotice({ ...ok, buttonUrl: "" })).rejects.toThrow();
    await expect(savePlatformNotice({ ...ok, buttonLabel: "" })).rejects.toThrow();
    await expect(savePlatformNotice({ ...ok, message: "x".repeat(241) })).rejects.toThrow();
  });

  it("only allows a Platterly page or an https address as the button link", () => {
    for (const url of ["/subscribe", "/settings/subscription", "https://platterly.in/offer", ""]) expect(() => checkNoticeUrl(url)).not.toThrow();
    for (const url of ["javascript:alert(1)", "http://example.com", "//evil.example", "data:text/html,x", "ftp://x"]) expect(() => checkNoticeUrl(url), url).toThrow();
  });
});
