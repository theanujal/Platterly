import { describe, it, expect } from "vitest";
import { matchesDeclaredType } from "../file-signature";

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 "), Buffer.alloc(8)]);
const pdf = Buffer.from("%PDF-1.7\n1 0 obj");
const script = Buffer.from("<script>alert(1)</script>");

describe("upload content check", () => {
  it("accepts real files of each allowed type", () => {
    expect(matchesDeclaredType(png, "image/png")).toBe(true);
    expect(matchesDeclaredType(jpg, "image/jpeg")).toBe(true);
    expect(matchesDeclaredType(webp, "image/webp")).toBe(true);
    expect(matchesDeclaredType(pdf, "application/pdf")).toBe(true);
  });

  it("refuses a script or HTML file renamed to look like an image or PDF", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp", "application/pdf"]) expect(matchesDeclaredType(script, type)).toBe(false);
  });

  it("refuses a real file of the wrong type, an empty file and an unknown type", () => {
    expect(matchesDeclaredType(png, "image/jpeg")).toBe(false);
    expect(matchesDeclaredType(pdf, "image/png")).toBe(false);
    expect(matchesDeclaredType(Buffer.alloc(0), "image/png")).toBe(false);
    expect(matchesDeclaredType(png, "image/svg+xml")).toBe(false);
  });
});
