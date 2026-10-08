/**
 * The shapes of everything the pages read through src/lib/content.ts. Today they come from files in this repo; when
 * Platterly Ops gets its content area, the same shapes come from Ops and the pages do not change.
 */
export interface PageDoc {
  slug: string;
  title: string;
  summary: string;
  /** ISO date the page was last reviewed, shown as "Last updated". */
  updated: string;
  /** Markdown. */
  body: string;
}

export type Colourway = "sunrise" | "blossom" | "citrus" | "dusk";

export interface PostDoc {
  slug: string;
  title: string;
  excerpt: string;
  /** ISO date. */
  date: string;
  author: string;
  tags: string[];
  colourway: Colourway;
  /** Markdown. */
  body: string;
  readingMinutes: number;
}

export interface Release {
  id: string;
  /** ISO date. */
  date: string;
  title: string;
  /** Markdown, kept short. */
  body: string;
  kind: "new" | "improved";
  product: "catering";
}

export type UpcomingStage = "planned" | "in-progress" | "beta";

export interface UpcomingItem {
  id: string;
  title: string;
  text: string;
  stage: UpcomingStage;
  /** Free text such as "Next quarter"; only shown when set. */
  when?: string;
}

/** The thin bar above the header. */
export interface Notice {
  enabled: boolean;
  text: string;
  linkLabel?: string;
  linkHref?: string;
}
