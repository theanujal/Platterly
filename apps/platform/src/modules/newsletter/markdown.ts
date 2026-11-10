import { p } from "../auth/email-layout";

// Newsletter body (Markdown, as the Ops editor writes it) to the HTML that goes inside the approved email layout. Everything is escaped first and only a few things are
// turned back into markup, so a body can never inject HTML. A paragraph that is only a link becomes a button. Pictures written `/uploads/<name>` get a full address.
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const ORANGE = "#F26B1D";

export function safeUrl(raw: string, imageBase: string): string | null {
  const url = raw.trim().replace(/&amp;/g, "&");
  if (/^\/uploads\/[a-z0-9][a-z0-9._-]{0,120}$/.test(url) && !url.includes("..")) return `${imageBase.replace(/\/$/, "")}${url}`;
  if (/^https:\/\/[^\s"'<>]+$/.test(url) || /^mailto:[^\s"'<>]+$/.test(url)) return url;
  if (/^http:\/\/(localhost|[a-z0-9-]+\.localhost)(:\d+)?(\/[^\s"'<>]*)?$/.test(url)) return url;
  return null;
}

function inline(source: string, imageBase: string): string {
  let out = escapeHtml(source);
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt: string, src: string) => {
    const url = safeUrl(src, imageBase);
    return url ? `<img src="${escapeHtml(url)}" alt="${alt}" style="display:block;max-width:100%;height:auto;border-radius:8px;margin:0 0 16px;" />` : alt;
  });
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, href: string) => {
    const url = safeUrl(href, imageBase);
    return url ? `<a href="${escapeHtml(url)}" style="color:${ORANGE};text-decoration:underline;">${label}</a>` : label;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  return out;
}

const heading = (level: number, html: string) => `<h${level + 1} style="margin:8px 0 12px;font-family:${FONT};font-size:${level === 1 ? 20 : level === 2 ? 17 : 15}px;line-height:1.35;color:#111827;">${html}</h${level + 1}>`;

export function renderNewsletterBody(markdown: string, imageBase: string): string {
  const blocks = markdown.replace(/\r\n?/g, "\n").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return blocks
    .map((block) => {
      const h = /^(#{1,3})\s+(.+)$/.exec(block);
      if (h) return heading(h[1].length, inline(h[2], imageBase));
      if (/^(-{3,}|\*{3,})$/.test(block)) return `<hr style="border:0;border-top:1px solid #E5E7EB;margin:20px 0;" />`;
      const lines = block.split("\n");
      if (lines.every((l) => /^>\s?/.test(l))) return `<blockquote style="margin:0 0 16px;padding:4px 16px;border-left:3px solid #F8DDB8;color:#4B5563;font-size:14px;line-height:1.65;">${lines.map((l) => inline(l.replace(/^>\s?/, ""), imageBase)).join("<br />")}</blockquote>`;
      if (lines.every((l) => /^[-*]\s+/.test(l))) return `<ul style="margin:0 0 16px;padding-left:20px;font-size:14px;line-height:1.65;color:#374151;">${lines.map((l) => `<li>${inline(l.replace(/^[-*]\s+/, ""), imageBase)}</li>`).join("")}</ul>`;
      if (lines.every((l) => /^\d+[.)]\s+/.test(l))) return `<ol style="margin:0 0 16px;padding-left:20px;font-size:14px;line-height:1.65;color:#374151;">${lines.map((l) => `<li>${inline(l.replace(/^\d+[.)]\s+/, ""), imageBase)}</li>`).join("")}</ol>`;
      const image = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(block);
      if (image) return inline(block, imageBase);
      const button = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(block);
      const buttonUrl = button ? safeUrl(button[2], imageBase) : null;
      if (button && buttonUrl) {
        return `<p style="margin:0 0 20px;"><a href="${escapeHtml(buttonUrl)}" style="display:inline-block;background:${ORANGE};color:#FFFFFF;text-decoration:none;font-family:${FONT};font-size:14px;font-weight:600;padding:12px 22px;border-radius:10px;">${escapeHtml(button[1])}</a></p>`;
      }
      return p(lines.map((l) => inline(l, imageBase)).join("<br />"));
    })
    .join("");
}

/** The plain-text twin: the Markdown with its markers removed and links written out. */
export function newsletterText(markdown: string, imageBase: string): string {
  return markdown
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt: string) => alt)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, href: string) => `${label}: ${safeUrl(href, imageBase) ?? ""}`.trim())
    .replace(/^#{1,3}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1");
}
