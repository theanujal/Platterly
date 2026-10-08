# Platterly marketing site: design system

Source: **calendly.com's own live stylesheet and page, read on 2026-10-08.** The earlier version of this file described Calendly's older look (Gilroy, `#006bff`, `#0b3558`); that is not what the site ships today. Only free-licensed fonts are used.

## Tokens (`src/app/globals.css`)
| Token (class) | Value | Calendly name |
|---|---|---|
| `ink-navy` | `#071a31` | Midnight (all text, primary buttons, dark footer) |
| `cloud` (page) | `#fcfbf8` | Magnolia |
| `pebble` (panels) | `#f5f3ee` | Linen |
| `badge-fill` | `#fff3e6` | Sunbeam |
| `slate-gray` | `#49535c` | Neutral 650 (secondary text) |
| `mist-gray` | `#a4aeb7` | Neutral 300 (text on Midnight) |
| `hairline` | `#e1e4e7` | dividers |
| `brand` (icons, lines, never text) | Platterly orange `#ff6900` | |
| `accent` (announcement bar) | Peach `#ffb067` | |
| `sky` | `#ffd39d` | |

**One palette on every page, product pages included** (calendly.com keeps one palette on every product page; Platterly's is the orange and peach of the catering app where Calendly has blue). A product only lends its own colour (`src/content/products.ts`: Catering is the catering app's orange, `#ff6900`, no darker shade) to: its icon tile (menu, scene, chapter label, platform list), the tint behind its pictures, and the thin line under the active feature. It is set inline as `--product` / `--product-tint` and read with `bg-product` / `bg-product-tint`. Orange is never text; text and buttons are Midnight. The Platterly logo mark is its own orange (`#f26a21`) everywhere.

## Type: Geist (SIL Open Font License, via `next/font/google`)
Calendly's own sans-serif for its UI. Sizes follow Calendly's scale; headings are weight 500 with tight tracking and `text-wrap: balance`.
| Class | Size (desktop / phone) | Use |
|---|---|---|
| `h-display` | 72 / 40px, tracking -2px, line-height 1.1 | Hero and closing headline |
| `h-hero` | 60 / 36px | Footer sign-off |
| `h-serif` | 52 / 36px, Newsreader 500 | Feature-chapter headings |
| `h-section` | 48 / 32px | Section headings |
| `h-sub` | 28 / 22px | Card titles |
| `eyebrow` | 12px, 600, uppercase, 0.08em | Small label above a heading |
| body | 20 / 18 / 16 / 14px, line-height 1.4 to 1.6 | |

## Buttons (`ButtonLink`)
48px tall, 8px radius, Geist 500 16px, 150ms colour transition, arrows nudge 2px on hover. **Primary** is Midnight with Magnolia text. **Outline** is a 1px Midnight border. **Ghost** is text. No coloured buttons.

## Colour: one gradient, from Pexels
The coloured surfaces (hero, scenes, chapter panels, closing band, step cards) all use the soft gradient photo AJ chose (`public/media/gradient.webp`: lavender, rose, cream, butter and orange), each cropped to a different corner, so one calm palette runs through the page: `--aurora`, `--scene-bg`, `--band-bg` and four colourways `cw-sunrise`, `cw-blossom`, `cw-citrus`, `cw-dusk`. Orange (`#ff6900`) stays the brand and the product colour, only ever as a fill, line or icon. Midnight text on any part of the gradient is above 7:1 (checked with the ui-ux-pro-max skill, whose food-service guidance matched: orange as a fill, midnight text, warm off-white page).

## Width
Header, announcement bar, panels, scene and footer run the full width of the screen: panels and the footer panel are 24px in from each edge (1872px wide at 1920), header content has 48px side padding. Only the content inside them (scene card, chapters, cards) is capped at 1200px and centred.

## Page frame
- **Announcement bar:** Peach, icon, one line, a "Learn more" pill, a close button.
- **Header:** the page's own bar scrolls away on screens 1024px and wider; once you have scrolled, a **floating white bar** (24px from the top, 48px from the sides, 72px tall, 20px radius, shadow) carries the same menu and buttons, and steps aside while the pinned scene is on screen. Below 1024px it is a normal sticky bar with a panel. Menus (`src/content/nav.ts`): **Product** (Catering on its orange tile) and **Resources** (Discover: About; Support: Contact us, Book a demo, Log in). No Solutions or Pricing; pricing, FAQ and product detail live on each product's page.
- **Footer:** one dark Midnight rounded panel: sign-off and logo on the left; Products, Discover and Support on the right; a rule; legal links and copyright.

## Scenes
- **ProductScene (home):** one card. It starts as a card under the headline, grows to fill the screen (24px in from every edge), holds for about 60% of a screen of scrolling, and lets go. The card says what Catering by Platterly is, with the app clip, a "Learn more" link and the Catering icon in its orange; a dashed "+" marks room for more products; an X skips it. Only on wide, tall screens with scripts and motion; otherwise the same card sits in a plain gradient panel.
- **StepCards (home):** four tall cards as an accordion: the hovered or focused card widens (about 1.55x) and shows its steps; below 1024px all are open. `Reveal` keeps its "revealed" state in React so a re-render cannot hide a card.
- **FeatureShowcase:** a product label on its tile, a serif heading (Newsreader, free OFL), a list where one item is open (a line in the product colour fills under it, then the next opens; hover or click takes over; an optional arrow link per item), beside a large gradient panel with the real screen on a product-tinted card. Home has one chapter for Catering; the Catering page has two.
- **ClosingBand (closing band, Catering):** a warm band with a rounded top, a heading, one line of copy and the call-to-action buttons. No cards or photos.
- **UiCard (`ui-cards.tsx`):** product visuals are small designed cards, not whole-page screenshots: one card per idea (orders, calendar, menu planning, approval, kitchen board, staffing, customers, payments) in calendly's double frame (a soft translucent ring around a white card), on a colourway panel, with a white icon tile overlapping the corner. Sample data only.
- **HowSteps (product pages):** a sideways row (snap, arrows, touch) of colourway cards, each with a UiCard and a numbered caption.
- **Voices:** customer quotes only when `TESTIMONIALS` in `src/content/site.ts` has real ones.

## Product page (Catering), after calendly.com/scheduling
Full-width aurora hero with only the product tile and name, the headline, "See plans" and "Book a Demo"; a feature chapter (list beside a gradient panel with the real screen); "How it works" (HowSteps); a second chapter for the day itself; use cases; pricing (`#pricing`); FAQ (`#faq`); the Platterly platform list; the closing band. Pricing, FAQ and product detail live only here.

## Motion
Transform and opacity only. Hero: staggered rise-in, the product scene pops up. Scroll: `Reveal` fades and lifts sections, children stagger (`rv-child`); the product scene is scroll-driven (clip-path and cross-fades). Hover: cards lift 3px, buttons change colour in 150ms. Tabs and list items cross-fade. Everything is visible without scripts (the hidden start needs the `js` class) and for people who ask for reduced motion.

## Components
`ButtonLink`, `buttonClasses`, `Badge`, `SectionHeader`, `Section`, `Panel`, `Stage`, `StageCard`, `PictureWell`, `Crop`, `Shot`, `Media`, `LoopVideo`, `ProductTile`, `ProductScene`, `StepCards`, `NumberedSteps`, `FeatureShowcase`, `ClosingBand`, `Voices`, `Reveal`, `Faq`, `AnnouncementBar`, `Header`, `Footer`, `SiteFrame`, `LegalPage`, `DemoProvider`, `DemoButton` and the Book a Demo pop-up (native dialog: name, email, phone).

## Titles are serif
Section titles (`h-section`) and card titles (`h-sub`) are set in Newsreader, a free serif, as calendly.com sets its feature headings in an editorial serif. The big headline at the top of a page (`h-display`, `h-hero`) and all body text stay Geist.

## Pages and templates
`PageHero` (the gradient opening panel), `ContentPage` (a Markdown page with a sticky contents list, the company's draft note and a questions card), `EnquiryForm` (Talk to us and Contact us), `BlogList` (topic filter and cards on colourways), a post page, What's new (grouped by month) and Upcoming (three columns). Policy text is Markdown rendered by `Markdown` with raw HTML switched off.

## Fonts (free licences only)
Geist for everything; Newsreader (`.h-serif`) only for the feature-chapter headings on product pages. Both are SIL Open Font License, served through `next/font/google`.
