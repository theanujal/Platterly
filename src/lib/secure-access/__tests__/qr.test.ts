import { describe, it, expect } from "vitest";
import { generateQrCodeDataUrl } from "@/lib/secure-access/qr";

describe("generateQrCodeDataUrl() (Chunk 2 Group 2.4)", () => {
  it("returns a well-formed PNG data URL", async () => {
    const dataUrl = await generateQrCodeDataUrl("https://mykitchen.platterly.in/example");
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(dataUrl.length).toBeGreaterThan(100);
  });
});
