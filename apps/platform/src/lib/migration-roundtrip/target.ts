// Pure validator for the one database the up/down/up round trip may ever touch. It takes the URL and the allowed ports as arguments and
// returns a verdict: it makes no connection, reads no environment and has no default for anything the caller must decide.
// Reasons never repeat the URL, so a password in it cannot leak into a log.

export const TEST_DATABASE_NAME = "platterly_platform_test";
export const TEST_ROLE_NAME = "platterly_platform_test_app";

const LOOPBACK_HOSTS: readonly string[] = ["127.0.0.1", "localhost", "[::1]"];

export type TargetCheck =
  | { ok: true; host: string; port: number; database: string; role: string }
  | { ok: false; reason: string };

const refuse = (reason: string): TargetCheck => ({ ok: false, reason });

export function validateTestTarget(url: string, allowedPorts: readonly number[]): TargetCheck {
  if (!Array.isArray(allowedPorts) || allowedPorts.length === 0) return refuse("no allowed port was given");
  if (!allowedPorts.every((p) => Number.isInteger(p) && p >= 1 && p <= 65535)) return refuse("an allowed port is not a valid port number");

  if (typeof url !== "string" || url === "") return refuse("no URL was given");
  if (url.length > 2048) return refuse("the URL is too long");
  if (/[\s\u0000-\u001f\u007f]/.test(url)) return refuse("the URL contains whitespace or control characters");
  if (url.includes("?") || url.includes("#")) return refuse("the URL has a query or fragment");

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return refuse("the URL cannot be parsed");
  }

  if (parsed.protocol !== "postgresql:") return refuse("the scheme is not postgresql");
  if (!LOOPBACK_HOSTS.includes(parsed.hostname.toLowerCase())) return refuse("the host is not loopback");
  if (parsed.port === "") return refuse("the URL has no explicit port");
  const port = Number(parsed.port);
  if (!allowedPorts.includes(port)) return refuse("the port is not in the allowed list");
  if (parsed.username !== TEST_ROLE_NAME) return refuse("the role is not the approved test role");
  if (parsed.pathname !== `/${TEST_DATABASE_NAME}`) return refuse("the database is not the approved test database");

  return { ok: true, host: parsed.hostname.toLowerCase(), port, database: TEST_DATABASE_NAME, role: TEST_ROLE_NAME };
}
