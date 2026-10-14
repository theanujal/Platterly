/**
 * The public-link rules in one place that the browser can import too (slug.ts is server-only): the longest link, the
 * characters allowed, and the address shown before the field. The form's counter, the field's limit and the server's
 * check all read these, so they cannot drift apart.
 */
export const MAX_SLUG_LENGTH = 60;
export const SLUG_PATTERN = /^[a-zA-Z0-9_-]+$/;

/** "catering.platterly.in/" in production, "catering.localhost:3000/" in dev: the real address of a kitchen's page. */
export function storefrontLinkPrefix(appUrl: string | undefined = process.env.NEXT_PUBLIC_APP_URL): string {
  try {
    return `${new URL(appUrl ?? "https://catering.platterly.in").host}/`;
  } catch {
    return "catering.platterly.in/";
  }
}
