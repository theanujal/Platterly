import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import sharp from "sharp";

/**
 * The print-ready file for one Order QR stand (docs/ops-contract.md section 33): A6 (4 x 6 in) portrait with the kitchen's
 * logo and name, a QR code to its direct public link and "Powered by Platterly" always at the bottom. One fixed template;
 * the kitchen only chooses the quantity. Printed on acrylic, so there is a plain white card with a thin orange edge and
 * generous margins (nothing important within 8 mm of the edge).
 */

const ORANGE: [number, number, number] = [255, 105, 0];
const TEXT: [number, number, number] = [17, 24, 39];
const MUTED: [number, number, number] = [107, 114, 128];

export const STAND_PAGE = { widthPt: 288, heightPt: 432 } as const;

export interface StandPrintData {
  kitchenName: string;
  /** PNG bytes of the kitchen's logo, or null (the name alone then carries the top of the card). */
  logo: { bytes: Uint8Array; width: number; height: number } | null;
  qrPng: Uint8Array;
  linkUrl: string;
  /** public/platterly-logo.png for the footer. */
  platterlyLogo: Uint8Array;
}

/** Pure: draws the card and returns the PDF bytes. */
export function renderStandPrintPdf(data: StandPrintData): ArrayBuffer {
  const { widthPt: w, heightPt: h } = STAND_PAGE;
  const doc = new jsPDF({ unit: "pt", format: [w, h], compress: true, orientation: "portrait" });
  doc.setProperties({ title: `Order QR stand - ${data.kitchenName}`, author: "Platterly" });
  const ink = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);
  const font = (weight: "bold" | "normal", size: number) => doc.setFont("helvetica", weight).setFontSize(size);

  // The thin orange edge.
  doc.setDrawColor(ORANGE[0], ORANGE[1], ORANGE[2]).setLineWidth(3);
  doc.roundedRect(14, 14, w - 28, h - 28, 14, 14, "S");

  let y = 46;
  if (data.logo) {
    const maxW = 170;
    const maxH = 66;
    const scale = Math.min(maxW / data.logo.width, maxH / data.logo.height);
    const lw = data.logo.width * scale;
    const lh = data.logo.height * scale;
    doc.addImage(data.logo.bytes, "PNG", (w - lw) / 2, y, lw, lh, "kitchen-logo", "FAST");
    y += lh + 16;
  } else {
    y += 14;
  }

  font("bold", 20);
  ink(TEXT);
  const nameLines = (doc.splitTextToSize(data.kitchenName, w - 72) as string[]).slice(0, 2);
  doc.text(nameLines, w / 2, y + 14, { align: "center" });
  y += nameLines.length * 24 + 6;

  font("normal", 11);
  ink(MUTED);
  doc.text("Scan to see our menu and order", w / 2, y + 8, { align: "center" });
  y += 26;

  const qr = 176;
  doc.addImage(data.qrPng, "PNG", (w - qr) / 2, y, qr, qr, "qr", "FAST");
  y += qr + 16;

  font("normal", 8.5);
  ink(MUTED);
  const display = data.linkUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  doc.text(doc.splitTextToSize(display, w - 72).slice(0, 2) as string[], w / 2, y, { align: "center" });

  // "Powered by Platterly" always at the bottom.
  const footerY = h - 52;
  doc.setDrawColor(229, 231, 235).setLineWidth(0.8);
  doc.line(48, footerY - 14, w - 48, footerY - 14);
  font("normal", 9);
  ink(MUTED);
  const poweredWidth = doc.getTextWidth("Powered by ");
  const logoW = 62;
  const logoH = logoW * (67.66 / 300.18);
  const startX = (w - (poweredWidth + logoW)) / 2;
  doc.text("Powered by", startX, footerY + 4);
  doc.addImage(data.platterlyLogo, "PNG", startX + poweredWidth, footerY - 6, logoW, logoH, "platterly-logo", "FAST");

  return doc.output("arraybuffer");
}

/** The kitchen's logo as PNG bytes (jsPDF cannot draw WebP, which is what logos are stored as), or null if it cannot be had. */
async function fetchLogo(url: string | null, fetchImpl: typeof fetch): Promise<StandPrintData["logo"]> {
  if (!url || !/^https?:\/\//.test(url)) return null;
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(8_000), redirect: "follow" });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > 8 * 1024 * 1024) return null;
    const { data, info } = await sharp(bytes).resize({ width: 600, height: 300, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).png().toBuffer({ resolveWithObject: true });
    return { bytes: new Uint8Array(data), width: info.width, height: info.height };
  } catch {
    return null;
  }
}

/** Builds the file for a stand order: fetches the logo, makes the QR, reads Platterly's logo, and draws the card. */
export async function buildStandPrintFile(order: { kitchenName: string; kitchenLogoUrl: string | null; linkUrl: string }, fetchImpl: typeof fetch = fetch): Promise<ArrayBuffer> {
  const [logo, qr, platterlyLogo] = await Promise.all([
    fetchLogo(order.kitchenLogoUrl, fetchImpl),
    QRCode.toBuffer(order.linkUrl, { type: "png", errorCorrectionLevel: "M", margin: 1, width: 700 }),
    readFile(path.join(process.cwd(), "public", "platterly-logo.png")),
  ]);
  return renderStandPrintPdf({ kitchenName: order.kitchenName, logo, qrPng: new Uint8Array(qr), linkUrl: order.linkUrl, platterlyLogo: new Uint8Array(platterlyLogo) });
}
