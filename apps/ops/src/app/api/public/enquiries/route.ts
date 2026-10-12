import { createEnquiry, EnquiryError, parseEnquiry } from "@/modules/enquiries/enquiries";
import { isRateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * The marketing site's forms post here (Book a demo / Talk to us, Contact us). Public, so: only the site's own origins get the
 * CORS answer (SITE_ORIGINS, comma separated), a robot's filled hidden field is answered 200 and ignored, and one address may send
 * 10 an hour. Nothing about the business or its customers is read or returned.
 */
const DEFAULT_ORIGINS = ["https://platterly.in", "https://www.platterly.in"];

function allowedOrigins(): string[] {
  const configured = (process.env.SITE_ORIGINS ?? "").split(",").map((o) => o.trim().replace(/\/+$/, "")).filter(Boolean);
  return configured.length > 0 ? configured : DEFAULT_ORIGINS;
}

function cors(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigins().includes(origin)) return { Vary: "Origin" };
  return { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Accept", "Access-Control-Max-Age": "86400", Vary: "Origin" };
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: cors(request) });
}

export async function POST(request: Request) {
  const headers = cors(request);
  const reply = (status: number, body: unknown) => Response.json(body, { status, headers });
  // A browser from another site gets no answer it can read, and nothing is stored.
  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins().includes(origin)) return new Response("Forbidden", { status: 403, headers });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(`enquiry:${ip}`, 10, 60 * 60 * 1000)) return reply(429, { error: "Too many messages from this address. Please try again in a little while." });

  const raw = await request.text();
  if (raw.length > 16 * 1024) return reply(413, { error: "That message is too long." });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return reply(400, { error: "Please send the form as JSON." });
  }
  // A robot filled the hidden field: pretend it worked, store nothing.
  if (typeof body === "object" && body !== null && typeof (body as Record<string, unknown>).website === "string" && (body as Record<string, unknown>).website) return reply(200, { ok: true });
  try {
    const row = await createEnquiry(parseEnquiry(body));
    return reply(200, { ok: true, id: row.id });
  } catch (error) {
    if (error instanceof EnquiryError) return reply(400, { error: error.message });
    console.error("[enquiries]", error);
    return reply(500, { error: "Something went wrong. Please try again." });
  }
}
