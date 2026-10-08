/**
 * The scenes in the closing band: a real person (a free Pexels photo, cut out) in front of a coloured card, and a state
 * chip across the middle showing what Platterly just did. They are scenes, not customers: nothing here names a person or
 * quotes one. Photos are in public/media/people (credits in CREDITS.md).
 */
export interface PeopleScene {
  /** File name in public/media/people, without the extension. */
  photo: string;
  alt: string;
  /** One of the colourways in globals.css (sunrise, blossom, citrus, dusk). */
  colourway: "sunrise" | "blossom" | "citrus" | "dusk";
  /** Fine-tunes how tall the person stands in the card (photos are cropped differently). */
  scale?: number;
  chip: string;
  /** Icon name (see components/icons.tsx) on the chip's coloured tile. */
  icon: string;
}

export const PEOPLE: PeopleScene[] = [
  { photo: "planner", alt: "A smiling event manager in a navy blazer with her arms crossed", colourway: "blossom", chip: "Menu approved", icon: "book" },
  { photo: "chef", alt: "A cheerful chef in a white jacket giving two thumbs up", colourway: "sunrise", scale: 0.8, chip: "Order sent to kitchen", icon: "chef" },
  { photo: "server", alt: "A smiling server in a dark kurta ready to serve", colourway: "citrus", chip: "Ready to serve", icon: "clipboard" },
  { photo: "billing", alt: "An accounts manager in a light blue blazer holding an invoice", colourway: "dusk", chip: "Payment received", icon: "wallet" },
];
