# Platterly marketing site (platterly.in)

A static site, separate from the catering app: its own `package.json`, lockfile, build and design system. Nothing here imports from the catering code.

| Page | Address |
|---|---|
| Home | `/` |
| Catering by Platterly (product page: pricing, FAQ, features) | `/catering` |
| Talk to us, Contact us | `/talk-to-us`, `/contact` |
| About | `/about` |
| Blog and articles, RSS | `/blog`, `/blog/<slug>`, `/blog/rss.xml` |
| What's new, Upcoming features | `/whats-new`, `/upcoming` |
| Privacy, Terms, Cancellation and Refund, Cookie, Shipping and Delivery, Security | `/privacy`, `/terms`, `/refund`, `/cookie-policy`, `/shipping-and-delivery`, `/security` |

## Commands (run inside `apps/site`)

| Command | What it does |
|---|---|
| `npm install` | Installs the site's own dependencies |
| `npm run dev` | Dev server on port 3100 |
| `npm run build` | Writes the static site to `out/` |
| `npm run check:links` | Checks `out/`: internal links, media, titles, descriptions, canonicals, one `h1` each, alt text |
| `npm run test:e2e` | Browser smoke tests of the built site (build first; uses the repo's Playwright) |
| `npm run capture` | Re-captures the app pictures and clips (needs the catering dev server on port 3000) |
| `npm run optimize:media` | Rebuilds the WebP files in `public/media` from `scripts/.raw` |

## Look
Taken from calendly.com's current design (midnight buttons on warm magnolia, linen panels, Geist). Platterly's own orange and peach where Calendly uses blue; Catering's tile is the app's `#ff6900`. See `DESIGN-SYSTEM.md`. Pages live in two route groups: `src/app/(brand)` and `src/app/catering`, each with its own layout.

## Where things live
- **Content** is read through one module, `src/lib/content.ts` (`getNotice`, `getPage`, `getPosts`, `getPost`, `getReleases`, `getUpcoming`). Today it reads files; when Platterly Ops gets its content area, the same functions call Ops and no page changes.
  - Policy and information pages: Markdown in `src/content/pages/*.md` (front matter: title, summary, updated). A lawyer can edit these directly.
  - Blog posts: Markdown in `src/content/posts/*.md` (front matter: title, excerpt, date, author, tags, colourway).
  - The top notice: `src/content/notice.ts` (`enabled: false` hides it). What's new: `src/content/releases.ts`. Upcoming: `src/content/upcoming.ts`.
  - Contact details, company details: `src/content/site.ts`. Phone, WhatsApp and hours on the Contact page appear only when filled in there.
  - Home and Catering page text: `src/content/home.ts`, `catering.ts`. Pricing: `catering.ts` (typed from the product's plans; ops will own it later).
- The people photos and the gradient are in `public/media` (credits in `public/media/people/CREDITS.md`). The product visuals are small designed cards (`src/components/ui-cards.tsx`), not screenshots.
- Legal pages are plain-language **drafts for a lawyer to review before launch**, written for Fragen Network Private Limited, Bangalore. No refunds; the account is paused 7 days after a missed payment.

## Forms (Talk to us, Contact us)
Both check every field, ignore robots with a hidden field, and send to `NEXT_PUBLIC_ENQUIRY_ENDPOINT` at build time (JSON: `kind`, `name`, `email`, `phone`, `businessType`, `subject`, `message`, `page`, `source`). That is where Platterly Ops will plug in. With it unset, the form opens a ready-written email to hello@platterly.in.

## Serving
`out/` is plain files. Serve it with Nginx on `platterly.in`; give `/media/*` and `/_next/static/*` long cache lifetimes. The catering app answers 404 on the bare domain, so nothing overlaps.
