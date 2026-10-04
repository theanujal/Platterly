import { describe, it, expect } from "vitest";
import { classifySource, cleanSrcTag, parseUserAgent, pickClientIp, pickLocation, visitorKey } from "@/modules/storefront-visits/visit-math";

const base = { src: null, referrer: null, embedded: false, ancestor: null, ownHost: "catering.platterly.in" };

describe("where a visit came from", () => {
  it("Google, other search engines, WhatsApp, Instagram and Facebook are told apart by the referring site", () => {
    expect(classifySource({ ...base, referrer: "https://www.google.com/" })).toEqual({ source: "GOOGLE", detail: "google.com" });
    expect(classifySource({ ...base, referrer: "https://www.google.co.in/search?q=x" }).source).toBe("GOOGLE");
    expect(classifySource({ ...base, referrer: "https://www.bing.com/" }).source).toBe("OTHER_SEARCH");
    expect(classifySource({ ...base, referrer: "https://l.wl.co/l?u=x" }).source).toBe("WHATSAPP");
    expect(classifySource({ ...base, referrer: "https://l.instagram.com/?u=x" }).source).toBe("INSTAGRAM");
    expect(classifySource({ ...base, referrer: "https://m.facebook.com/" }).source).toBe("FACEBOOK");
    expect(classifySource({ ...base, referrer: "https://some-blog.example/post" })).toEqual({ source: "REFERRAL", detail: "some-blog.example" });
  });
  it("no referrer, or a click from the storefront's own pages, is direct", () => {
    expect(classifySource(base).source).toBe("DIRECT");
    expect(classifySource({ ...base, referrer: "https://catering.platterly.in/abc/plan/1" }).source).toBe("DIRECT");
    expect(classifySource({ ...base, referrer: "not a url at all" }).source).toBe("DIRECT");
  });
  it("a ?src= tag beats the referrer; unknown tags become the kitchen's own campaign", () => {
    expect(classifySource({ ...base, src: "whatsapp", referrer: "https://www.google.com/" }).source).toBe("WHATSAPP");
    expect(classifySource({ ...base, src: "QR" }).source).toBe("QR");
    expect(classifySource({ ...base, src: "flyer" })).toEqual({ source: "CAMPAIGN", detail: "flyer" });
    // Anything that is not a short plain word is ignored, so it cannot be used to put text into a report.
    expect(classifySource({ ...base, src: "<script>alert(1)</script>" }).source).toBe("DIRECT");
    expect(cleanSrcTag("a".repeat(31))).toBeNull();
    expect(cleanSrcTag("Diwali_2026")).toBe("diwali_2026");
  });
  it("inside a frame it is an embed, naming the website that holds it", () => {
    expect(classifySource({ ...base, embedded: true, ancestor: "https://www.abc-caterer.com", referrer: "https://www.google.com/" })).toEqual({ source: "EMBED", detail: "abc-caterer.com" });
    expect(classifySource({ ...base, embedded: true, referrer: "https://abc-caterer.com/menu" }).detail).toBe("abc-caterer.com");
    expect(classifySource({ ...base, embedded: true })).toEqual({ source: "EMBED", detail: null });
  });
});

describe("who is visiting", () => {
  it("reads phone, tablet and computer, and the browser", () => {
    const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    const android = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
    const androidTablet = "Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
    const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
    const edge = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Edg/120.0";
    expect(parseUserAgent(iphone)).toMatchObject({ device: "MOBILE", browser: "Safari", bot: false });
    expect(parseUserAgent(android)).toMatchObject({ device: "MOBILE", browser: "Chrome" });
    expect(parseUserAgent(androidTablet).device).toBe("TABLET");
    expect(parseUserAgent(mac)).toMatchObject({ device: "DESKTOP", browser: "Safari" });
    expect(parseUserAgent(edge).browser).toBe("Edge");
  });
  it("search crawlers, link previews, monitors and scripts are bots; an empty agent too", () => {
    for (const ua of ["Googlebot/2.1 (+http://www.google.com/bot.html)", "facebookexternalhit/1.1", "WhatsApp/2.23.20", "Mozilla/5.0 HeadlessChrome/120", "curl/8.4.0", "UptimeRobot/2.0", ""]) {
      expect(parseUserAgent(ua).bot, ua).toBe(true);
    }
    expect(parseUserAgent(null).bot).toBe(true);
  });
  it("takes the IP from Cloudflare, else the first forwarded address; refuses anything that is not an address", () => {
    expect(pickClientIp(new Headers({ "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "10.0.0.1" }))).toBe("203.0.113.9");
    expect(pickClientIp(new Headers({ "x-forwarded-for": "198.51.100.4, 10.0.0.1" }))).toBe("198.51.100.4");
    expect(pickClientIp(new Headers({ "x-forwarded-for": "::ffff:198.51.100.4" }))).toBe("198.51.100.4");
    expect(pickClientIp(new Headers({ "x-forwarded-for": "::1" }))).toBe("127.0.0.1");
    expect(pickClientIp(new Headers({ "x-forwarded-for": "<script>" }))).toBeNull();
    expect(pickClientIp(new Headers())).toBeNull();
  });
  it("reads Cloudflare's country and city, ignoring its 'unknown' codes", () => {
    expect(pickLocation(new Headers({ "cf-ipcountry": "in", "cf-ipcity": "Mysuru" }))).toEqual({ country: "IN", city: "Mysuru" });
    expect(pickLocation(new Headers({ "cf-ipcountry": "XX" }))).toEqual({ country: null, city: null });
    expect(pickLocation(new Headers())).toEqual({ country: null, city: null });
  });
  it("the visitor key is the same for the same person on the same day, and different across days, people or secrets", () => {
    const day1 = new Date("2026-10-04T05:00:00Z");
    const a = visitorKey("1.2.3.4", "UA", day1, "s");
    expect(visitorKey("1.2.3.4", "UA", new Date("2026-10-04T22:00:00Z"), "s")).toBe(a);
    expect(visitorKey("1.2.3.4", "UA", new Date("2026-10-05T05:00:00Z"), "s")).not.toBe(a);
    expect(visitorKey("1.2.3.5", "UA", day1, "s")).not.toBe(a);
    expect(visitorKey("1.2.3.4", "UA", day1, "other")).not.toBe(a);
    expect(a).not.toContain("1.2.3.4");
  });
});
