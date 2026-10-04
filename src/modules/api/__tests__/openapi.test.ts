import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { buildOpenApi, documentedRoutes } from "../openapi";
import { API_SCOPES } from "../scopes";

/**
 * Chunk 25 — the API document must match the API. Every route file under app/api/v1 has to appear in the OpenAPI
 * description with the same methods and the same required permission, and the description must not mention a route
 * that does not exist. Adding an endpoint without documenting it fails here.
 */
const root = path.join(process.cwd(), "src/app/api/v1");

function routeFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) routeFiles(full, out);
    else if (name === "route.ts") out.push(full);
  }
  return out;
}

function actualRoutes(): string[] {
  const found: string[] = [];
  for (const file of routeFiles(root)) {
    const rel = path.relative(root, path.dirname(file)).split(path.sep).join("/");
    const url = "/" + rel.replace(/\[(\w+)\]/g, "{$1}");
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/export const (GET|POST|PATCH|PUT|DELETE) = apiRoute(?:<[^>]*>)?\(\{ scope: (?:"([^"]+)"|null) \}/g)) found.push(`${m[1]} ${url}${m[2] ? ` [${m[2]}]` : ""}`);
  }
  return found.sort();
}

describe("the OpenAPI document", () => {
  it("lists exactly the routes that exist, with the permission each one needs", () => {
    const spec = buildOpenApi() as { paths: Record<string, Record<string, { "x-required-scope": string | null }>> };
    const documented = Object.entries(spec.paths)
      .flatMap(([url, methods]) => Object.entries(methods).map(([method, op]) => `${method.toUpperCase()} ${url}${op["x-required-scope"] ? ` [${op["x-required-scope"]}]` : ""}`))
      .sort();
    expect(actualRoutes()).toEqual(documented);
    expect(documentedRoutes().length).toBe(documented.length);
  });

  it("uses only permissions the API knows, and every one is used by some route", () => {
    const used = new Set(actualRoutes().flatMap((r) => (r.match(/\[(.+)\]/) ? [r.match(/\[(.+)\]/)![1]] : [])));
    for (const scope of used) expect(API_SCOPES.map((s) => s.id)).toContain(scope);
    for (const scope of API_SCOPES.map((s) => s.id)) expect(used.has(scope), scope).toBe(true);
  });

  it("is plain JSON that references only schemas it defines", () => {
    const spec = JSON.parse(JSON.stringify(buildOpenApi()));
    const defined = new Set(Object.keys(spec.components.schemas));
    for (const [, name] of JSON.stringify(spec).matchAll(/#\/components\/schemas\/(\w+)/g)) expect(defined.has(name), name).toBe(true);
    expect(spec.openapi).toBe("3.0.3");
    expect(spec.components.securitySchemes.bearerAuth.scheme).toBe("bearer");
  });

  it("sends every handler through apiRoute, so no route can skip authentication, rate limiting or the scope check", () => {
    const bare: string[] = [];
    for (const file of routeFiles(root)) {
      const text = readFileSync(file, "utf8");
      const rel = path.relative(root, file);
      for (const m of text.matchAll(/export (?:const|async function|function) (GET|POST|PATCH|PUT|DELETE)\b([^\n]*)/g)) {
        if (!/apiRoute/.test(m[2])) bare.push(`${m[1]} ${rel}`);
      }
    }
    // The OpenAPI document itself is public: it describes the API and carries no data.
    expect(bare).toEqual(["GET openapi.json/route.ts"]);
  });
});
