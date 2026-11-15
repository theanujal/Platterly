import "server-only";
import { ABOUT_MAX, FEATURE_ICONS, MAX_FEATURES, isCardImageRef, isProductKey, type ProductFeature } from "@platterly/contract";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { notify } from "@/modules/notifications/notifications";

/** What staff edit on the Products page: a live product's card line and picture, and the upcoming products (AJ, 2026-11-15). */
export class ProductCardError extends Error {}

export interface UpcomingInput {
  key: string;
  name: string;
  tagline: string;
  cardImage: string | null;
  logo: string | null;
  launchAt: Date | null;
  sortOrder: number;
  /** The switch: on = "Coming soon" (and the countdown); off = staff have switched the product to live. */
  upcoming: boolean;
  visible: boolean;
}

const TAGLINE_MAX = 300;

/** A picture is `builtin:<name>` or an upload that exists in the picture library. Blank means no picture. */
async function checkImage(ref: string | null): Promise<string | null> {
  if (ref === null || ref === "") return null;
  if (!isCardImageRef(ref)) throw new ProductCardError("Pick one of the built-in pictures or an uploaded one.");
  if (ref.startsWith("upload:") && !(await prisma.siteMedia.findUnique({ where: { name: ref.slice(7) }, select: { id: true } }))) throw new ProductCardError("That uploaded picture is not in the library any more.");
  return ref;
}

/** A logo is always an upload from the picture library (no built-in set). Blank means none: the tile shows the first letter. */
async function checkLogo(ref: string | null): Promise<string | null> {
  if (ref === null || ref === "") return null;
  if (!ref.startsWith("upload:")) throw new ProductCardError("A logo is an uploaded picture.");
  return checkImage(ref);
}

function checkAbout(raw: string): string | null {
  const text = raw.trim();
  if (text.length > ABOUT_MAX) throw new ProductCardError(`The About text can be at most ${ABOUT_MAX} characters.`);
  return text === "" ? null : text;
}

/** The "What you can do" items: rows with no title are dropped; a row needs a known icon; at most four. */
export function checkFeatures(rows: { icon: string; title: string; text: string }[]): ProductFeature[] {
  const kept = rows.map((r) => ({ icon: r.icon, title: r.title.trim(), text: r.text.trim() })).filter((r) => r.title !== "" || r.text !== "");
  if (kept.length > MAX_FEATURES) throw new ProductCardError(`There can be at most ${MAX_FEATURES} items.`);
  for (const r of kept) {
    if (!(FEATURE_ICONS as readonly string[]).includes(r.icon)) throw new ProductCardError("Pick an icon for each item.");
    if (!r.title) throw new ProductCardError("Each item needs a title.");
    if (r.title.length > 80) throw new ProductCardError("An item title can be at most 80 characters.");
    if (r.text.length > 200) throw new ProductCardError("An item description can be at most 200 characters.");
  }
  return kept as ProductFeature[];
}

function checkTagline(raw: string): string | null {
  const text = raw.trim();
  if (text.length > TAGLINE_MAX) throw new ProductCardError(`The line can be at most ${TAGLINE_MAX} characters.`);
  return text === "" ? null : text;
}

/** A live product's card line and picture. A live product shows on the Account only once it has a line. */
export async function saveLiveCard(staffId: string | null, productKey: string, input: { tagline: string; cardImage: string | null; logo: string | null; about: string; features: { icon: string; title: string; text: string }[] }) {
  const product = await prisma.product.findUnique({ where: { key: productKey }, select: { key: true } });
  if (!product) throw new ProductCardError("Unknown product.");
  const tagline = checkTagline(input.tagline);
  const cardImage = await checkImage(input.cardImage);
  const logo = await checkLogo(input.logo);
  const about = checkAbout(input.about);
  const features = checkFeatures(input.features);
  await prisma.product.update({ where: { key: productKey }, data: { tagline, cardImage, logo, about, features: features as unknown as object[] } });
  await audit({ actorUserId: staffId, action: "product.card.saved", subject: productKey, detail: { tagline, cardImage, logo, about, features: features as unknown as object[] } });
}

export async function saveUpcoming(staffId: string | null, input: UpcomingInput, create: boolean) {
  const name = input.name.trim();
  if (!isProductKey(input.key)) throw new ProductCardError("The key is lowercase letters, digits and dashes, starting with a letter (2 to 32 characters).");
  if (!name || name.length > 200) throw new ProductCardError("Give the product a name.");
  if (input.launchAt && Number.isNaN(input.launchAt.getTime())) throw new ProductCardError("The launch date is not a date.");
  if (!Number.isInteger(input.sortOrder) || input.sortOrder < 0 || input.sortOrder > 9999) throw new ProductCardError("The order is a whole number from 0 to 9999.");
  if (await prisma.product.findUnique({ where: { key: input.key }, select: { key: true } })) throw new ProductCardError("That key belongs to a live product.");
  const existing = await prisma.upcomingProduct.findUnique({ where: { key: input.key } });
  if (create && existing) throw new ProductCardError("There is already an upcoming product with that key.");
  if (!create && !existing) throw new ProductCardError("Unknown upcoming product.");
  const data = { name, tagline: checkTagline(input.tagline), cardImage: await checkImage(input.cardImage), logo: await checkLogo(input.logo), launchAt: input.launchAt, sortOrder: input.sortOrder, upcoming: input.upcoming, visible: input.visible };
  // A new launch date is a new reminder: staff are told again when it arrives.
  const dateChanged = existing ? (existing.launchAt?.getTime() ?? null) !== (input.launchAt?.getTime() ?? null) : true;
  if (create) await prisma.upcomingProduct.create({ data: { key: input.key, ...data } });
  else await prisma.upcomingProduct.update({ where: { key: input.key }, data: { ...data, ...(dateChanged ? { launchNotifiedAt: null } : {}) } });
  await audit({ actorUserId: staffId, action: create ? "product.upcoming.created" : "product.upcoming.saved", subject: input.key, detail: { ...data, launchAt: input.launchAt?.toISOString() ?? null } });
}

export async function deleteUpcoming(staffId: string | null, key: string) {
  const { count } = await prisma.upcomingProduct.deleteMany({ where: { key } });
  if (count === 0) throw new ProductCardError("Unknown upcoming product.");
  await audit({ actorUserId: staffId, action: "product.upcoming.deleted", subject: key });
}

/**
 * Cron: staff are told once when an upcoming product's launch date arrives, and asked to switch it to live. The card says "Launching today" until they do.
 * One notification per product and date (WARNING, so it is also emailed to STAFF_NOTIFY_EMAILS). Returns how many were sent.
 */
export async function notifyDueLaunches(now = new Date()): Promise<number> {
  const due = await prisma.upcomingProduct.findMany({ where: { upcoming: true, visible: true, launchAt: { lte: now }, launchNotifiedAt: null } });
  let sent = 0;
  for (const product of due) {
    const created = await notify({
      kind: "product_launch_due",
      severity: "WARNING",
      title: `${product.name} launches today`,
      body: `${product.name} reached its launch date. Switch it to live on the Products page so its card stops saying "Coming soon".`,
      link: "/products",
      dedupeKey: `launch:${product.key}:${product.launchAt!.toISOString()}`,
    });
    await prisma.upcomingProduct.update({ where: { key: product.key }, data: { launchNotifiedAt: now } });
    if (created) sent += 1;
  }
  return sent;
}
