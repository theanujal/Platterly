import { describe, expect, it } from "vitest";
import { newsletterText, renderNewsletterBody, safeUrl } from "../markdown";

const BASE = "https://platterly.in";

describe("newsletter body to email HTML", () => {
  it("escapes raw HTML and scripts", () => {
    const html = renderNewsletterBody('Hello <script>alert(1)</script> & "you"\n\n<img src=x onerror=alert(1)>', BASE);
    expect(html).not.toContain("<script");
    expect(html).not.toMatch(/<img src=x/);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
  });
  it("makes headings, bold, italic, lists and quotes", () => {
    const html = renderNewsletterBody("# Big\n\n## Medium\n\nSome **bold** and *slanted* words\n\n- one\n- two\n\n1. first\n2. second\n\n> wise words", BASE);
    expect(html).toContain("<h2");
    expect(html).toContain("<h3");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>slanted</em>");
    expect(html).toMatch(/<ul[^>]*><li>one<\/li><li>two<\/li><\/ul>/);
    expect(html).toMatch(/<ol[^>]*><li>first<\/li><li>second<\/li><\/ol>/);
    expect(html).toContain("<blockquote");
  });
  it("turns a paragraph that is only a link into a button, and other links into plain links", () => {
    const button = renderNewsletterBody("[Read more](https://platterly.in/blog/x)", BASE);
    expect(button).toContain("display:inline-block");
    expect(button).toContain('href="https://platterly.in/blog/x"');
    const inline = renderNewsletterBody("See [our post](https://platterly.in/blog/x) today", BASE);
    expect(inline).toContain("text-decoration:underline");
    expect(inline).not.toContain("display:inline-block");
  });
  it("gives library pictures a full address and refuses other sources", () => {
    expect(renderNewsletterBody("![Our team](/uploads/team.jpg)", BASE)).toContain('src="https://platterly.in/uploads/team.jpg"');
    expect(renderNewsletterBody("![x](javascript:alert(1))", BASE)).not.toContain("<img");
    expect(renderNewsletterBody("![x](/uploads/../secret.png)", BASE)).not.toContain("<img");
    expect(renderNewsletterBody("![x](http://evil.example/a.png)", BASE)).not.toContain("<img");
  });
  it("refuses javascript, data and plain-http links but allows https, mailto and localhost http", () => {
    expect(safeUrl("javascript:alert(1)", BASE)).toBeNull();
    expect(safeUrl("data:text/html,x", BASE)).toBeNull();
    expect(safeUrl("http://evil.example", BASE)).toBeNull();
    expect(safeUrl("https://platterly.in", BASE)).toBe("https://platterly.in");
    expect(safeUrl("mailto:hello@platterly.in", BASE)).toBe("mailto:hello@platterly.in");
    expect(safeUrl("http://localhost:3100/a", BASE)).toBe("http://localhost:3100/a");
  });
  it("writes a plain-text version with links spelled out", () => {
    expect(newsletterText("# Hi\n\nRead [the post](https://platterly.in/p) **now**", BASE)).toBe("Hi\n\nRead the post: https://platterly.in/p now");
  });
});
