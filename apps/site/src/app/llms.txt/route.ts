import { SITE } from "@/content/site";
import { getPosts } from "@/lib/content";

export const dynamic = "force-static";

/** A plain summary for AI assistants and AI search (llmstxt.org): what Platterly is and which pages matter. Posts follow Ops. */
export async function GET() {
  const posts = await getPosts();
  const text = `# Platterly

> Platterly builds focused software for food businesses in India. Its first product, Caterly by Platterly, is catering management software: customers, events, menus, orders, the kitchen and payments in one place.

Caterly by Platterly is for wedding, corporate, party and outdoor caterers. A caterer adds the customer and the event (multi-day events, several meals a day, adults and children counted separately), plans the menu for each meal with the price building as dishes, extras and add-ons are chosen, and shares a link so the customer can approve the menu without logging in. Approved menus go to a kitchen board where the team moves each order from Pending to In Preparation to Ready. Advances, balances and invoices are tracked on the order. Staffing, vehicles and dispatch sit beside each event. Every account starts with seven days of full access and no card.

## Main pages

- [Caterly by Platterly](${SITE.url}/catering/): features, how it works and pricing
- [About Platterly](${SITE.url}/about/): who we are and how we build
- [Talk to us](${SITE.url}/talk-to-us/): tell us about your business and we call back to show how it fits
- [Contact us](${SITE.url}/contact/): questions or account help, ${SITE.contactEmail}
- [What's new](${SITE.url}/whats-new/): what has shipped, newest first
- [Upcoming features](${SITE.url}/upcoming/): what we are building next

## Blog

${posts.map((p) => `- [${p.title}](${SITE.url}/blog/${p.slug}/): ${p.excerpt}`).join("\n")}

## Policies

- [Privacy Policy](${SITE.url}/privacy/)
- [Terms and Conditions](${SITE.url}/terms/)
- [Cancellation and Refund Policy](${SITE.url}/refund/)
- [Security](${SITE.url}/security/)
`;
  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
