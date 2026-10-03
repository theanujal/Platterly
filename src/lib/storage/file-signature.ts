/**
 * Chunk 17.3 — does a file's real content match the type it claims? The browser reports a file's type from its
 * name, so a script renamed "logo.png" arrives as image/png. Every upload reads the first bytes and refuses a mismatch.
 */
const SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  "image/png": (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/jpeg": (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/webp": (b) => b.length > 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP",
  "application/pdf": (b) => b.length > 5 && b.subarray(0, 5).toString("latin1") === "%PDF-",
};

export function matchesDeclaredType(buffer: Buffer, mimeType: string): boolean {
  const check = SIGNATURES[mimeType];
  return check ? check(buffer) : false;
}
