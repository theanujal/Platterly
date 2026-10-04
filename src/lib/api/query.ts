import { parse, queryObject, v, type Spec } from "./schema";
import { pagingShape } from "./paging";

/** Parses `?a=b` against a shape plus the standard `page` / `per_page`; unknown parameters are refused. */
export function parseQuery<S extends Record<string, Spec<unknown>>>(url: URL, shape: S, opts: { numeric?: string[]; booleans?: string[] } = {}) {
  const rule = v.object({ ...pagingShape, ...shape });
  return parse(rule, queryObject(url.searchParams, ["page", "per_page", ...(opts.numeric ?? [])], opts.booleans ?? [])) as {
    page?: number;
    per_page?: number;
  } & { [K in keyof S]: S[K] extends Spec<infer U> ? U | undefined : never };
}
