import "server-only";
import { newId, parseReportDoc, signedHeaders, verifyRequest, type ProductManifest, type ReportDoc, type ReportListing } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { secretsOf } from "@/modules/registry/products";

/**
 * A product's own reports (docs/ops-contract.md section 23). Ops asks with a signed GET, checks that the product signed its
 * answer, validates the document and shows it. Nothing is stored: a report is always as fresh as the product's data.
 */
const TIMEOUT_MS = 20_000;

export type ReportResult = { ok: true; doc: ReportDoc } | { ok: false; error: string };

/** The reports a product's manifest lists (none when ops has not read a manifest, or the product has none). */
export function reportsOf(manifest: unknown): ReportListing[] {
  const list = (manifest as Partial<ProductManifest> | null)?.reports;
  return Array.isArray(list) ? list : [];
}

export async function fetchProductReport(productKey: string, reportKey: string, range: { from: string | null; to: string | null }, fetchImpl: typeof fetch = fetch): Promise<ReportResult> {
  const product = await prisma.product.findUnique({ where: { key: productKey } });
  if (!product || product.status !== "ACTIVE") return { ok: false, error: "This product is not active." };
  if (!reportsOf(product.manifest).some((r) => r.key === reportKey)) return { ok: false, error: "This product does not publish that report. Refresh its manifest." };
  let secrets: ReturnType<typeof secretsOf>;
  try {
    secrets = secretsOf(product);
  } catch {
    return { ok: false, error: "The product's signing secret could not be read. Rotate its secrets." };
  }
  const query = new URLSearchParams({ ...(range.from ? { from: range.from } : {}), ...(range.to ? { to: range.to } : {}) }).toString();
  try {
    const response = await fetchImpl(`${product.baseUrl}/api/ops/reports/${encodeURIComponent(reportKey)}${query ? `?${query}` : ""}`, {
      method: "GET",
      headers: signedHeaders(secrets.sign, newId("command"), ""),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "error",
    });
    const text = await response.text();
    if (!response.ok) return { ok: false, error: `The product answered ${response.status}.` };
    const verified = verifyRequest(secrets.accept, response.headers, text);
    if (!verified.ok) return { ok: false, error: `The report was not signed correctly (${verified.reason}).` };
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, error: "The report was not JSON." };
    }
    const parsed = parseReportDoc(json);
    if (!parsed.ok) return { ok: false, error: `The report is invalid: ${parsed.error}.` };
    if (parsed.value.report !== reportKey) return { ok: false, error: `The product sent "${parsed.value.report}" instead of "${reportKey}".` };
    return { ok: true, doc: parsed.value };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? `Could not reach the product: ${error.message}` : "Could not reach the product." };
  }
}
