import { createHash } from "node:crypto";

/**
 * Chunk 22: how one visit to a kitchen's public storefront is understood. Pure functions with no database, so every
 * rule is unit-tested. See `visits.ts` for where the visit is written down.
 */

export type VisitSourceValue = "GOOGLE" | "OTHER_SEARCH" | "WHATSAPP" | "INSTAGRAM" | "FACEBOOK" | "QR" | "EMAIL" | "EMBED" | "REFERRAL" | "CAMPAIGN" | "DIRECT";
export type VisitDeviceValue = "MOBILE" | "TABLET" | "DESKTOP";

export const VISIT_SOURCE_LABEL: Record<VisitSourceValue, string> = {
  GOOGLE: "Google",
  OTHER_SEARCH: "Other search engine",
  WHATSAPP: "WhatsApp",
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  QR: "QR code",
  EMAIL: "Email",
  EMBED: "Embedded on a website",
  REFERRAL: "Another website",
  CAMPAIGN: "Your own link tag",
  DIRECT: "Direct or unknown",
};

/** Link tags the kitchen can add to a link as `?src=`. Anything else becomes a "your own link tag" (CAMPAIGN). */
const TAG_SOURCE: Record<string, VisitSourceValue> = {
  whatsapp: "WHATSAPP",
  wa: "WHATSAPP",
  instagram: "INSTAGRAM",
  ig: "INSTAGRAM",
  facebook: "FACEBOOK",
  fb: "FACEBOOK",
  qr: "QR",
  email: "EMAIL",
  mail: "EMAIL",
  google: "GOOGLE",
  embed: "EMBED",
};

/** A tag is kept only if it is short and plain; it is shown back in reports, so nothing else is let through. */
export function cleanSrcTag(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const tag = raw.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,29}$/.test(tag) ? tag : null;
}

const hostOf = (value: string | null | undefined): string | null => {
  if (!value) return null;
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
};
export { hostOf as referrerHost };

const matches = (host: string, ...names: string[]) => names.some((name) => host === name || host.endsWith(`.${name}`));

export interface SourceInput {
  src: unknown;
  /** `document.referrer` from the browser (the page before, or the page holding the frame). */
  referrer: string | null;
  /** The browser says the storefront is inside a frame on another page. */
  embedded: boolean;
  /** The frame's parent page, when the browser knew it (`location.ancestorOrigins`). */
  ancestor: string | null;
  /** The storefront's own host, so a click from one of its own pages is not counted as a referral. */
  ownHost: string | null;
}

export function classifySource(input: SourceInput): { source: VisitSourceValue; detail: string | null } {
  const own = hostOf(input.ownHost);
  if (input.embedded) {
    const holder = hostOf(input.ancestor) ?? hostOf(input.referrer);
    return { source: "EMBED", detail: holder && holder !== own ? holder : null };
  }
  const tag = cleanSrcTag(input.src);
  if (tag) {
    const known = TAG_SOURCE[tag];
    return known ? { source: known, detail: tag } : { source: "CAMPAIGN", detail: tag };
  }
  const host = hostOf(input.referrer);
  if (!host || host === own) return { source: "DIRECT", detail: null };
  if (matches(host, "google.com", "google.co.in", "googleusercontent.com") || /^google\.[a-z.]+$/.test(host)) return { source: "GOOGLE", detail: host };
  if (matches(host, "bing.com", "duckduckgo.com", "yahoo.com", "ecosia.org", "yandex.com", "baidu.com")) return { source: "OTHER_SEARCH", detail: host };
  if (matches(host, "whatsapp.com", "wa.me", "l.wl.co")) return { source: "WHATSAPP", detail: host };
  if (matches(host, "instagram.com")) return { source: "INSTAGRAM", detail: host };
  if (matches(host, "facebook.com", "fb.com", "fb.me", "messenger.com")) return { source: "FACEBOOK", detail: host };
  return { source: "REFERRAL", detail: host };
}

const BOT = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp\/|preview|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python-requests|httpclient|node-fetch|axios|go-http/i;

export function parseUserAgent(ua: string | null | undefined): { device: VisitDeviceValue; browser: string; bot: boolean } {
  const agent = ua ?? "";
  if (!agent || BOT.test(agent)) return { device: "DESKTOP", browser: "Other", bot: true };
  const device: VisitDeviceValue = /ipad|tablet|(android(?!.*mobile))/i.test(agent) ? "TABLET" : /mobi|iphone|ipod|android/i.test(agent) ? "MOBILE" : "DESKTOP";
  const browser = /edg\//i.test(agent)
    ? "Edge"
    : /samsungbrowser/i.test(agent)
      ? "Samsung Internet"
      : /opr\/|opera/i.test(agent)
        ? "Opera"
        : /firefox|fxios/i.test(agent)
          ? "Firefox"
          : /chrome|crios/i.test(agent)
            ? "Chrome"
            : /safari/i.test(agent)
              ? "Safari"
              : "Other";
  return { device, browser, bot: false };
}

/**
 * The visitor's address. Behind Cloudflare it is `cf-connecting-ip`; behind Nginx alone it is the first
 * `x-forwarded-for` entry (the proxy must overwrite that header, not append). Plain local development has neither.
 */
export function pickClientIp(headers: Headers): string | null {
  const raw = headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for")?.split(",")[0] ?? headers.get("x-real-ip");
  const ip = raw?.trim();
  if (!ip || ip.length > 45 || !/^[0-9a-fA-F:.]+$/.test(ip)) return null;
  return ip === "::1" ? "127.0.0.1" : ip.replace(/^::ffff:/, "");
}

/** Cloudflare's own location headers (free once the site is behind it). Absent otherwise. */
export function pickLocation(headers: Headers): { country: string | null; city: string | null } {
  const country = headers.get("cf-ipcountry")?.trim().toUpperCase() ?? null;
  const city = headers.get("cf-ipcity");
  let decoded: string | null = null;
  try {
    decoded = city ? decodeURIComponent(city).slice(0, 80) : null;
  } catch {
    decoded = null;
  }
  return { country: country && /^[A-Z]{2}$/.test(country) && country !== "XX" && country !== "T1" ? country : null, city: decoded || null };
}

/** The same person on the same day gets the same key; nothing else can be linked, and it cannot be turned back into an IP. */
export function visitorKey(ip: string | null, userAgent: string | null, now: Date, secret: string): string {
  const day = now.toISOString().slice(0, 10);
  return createHash("sha256").update(`${ip ?? ""}|${userAgent ?? ""}|${day}|${secret}`).digest("hex").slice(0, 32);
}
