import "server-only";
import QRCode from "qrcode";

/**
 * Chunk 2 Group 2.4 — QR Code Menu (PRD §26). Generic over any resource URL
 * (menu selection link, payment link, storefront link) — callers decide what
 * URL to encode.
 */
export async function generateQrCodeDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url);
}
