/**
 * Name matching for the library review (AJ, 2026-10-11). Pure functions, no database, no imports.
 *
 * Kitchens write the same dish many ways ("Paneer Makhani", "paneer butter masala", "Panner Tikka (Achari)"), so a name is
 * first reduced to a normalized key. Two names with the same key are the same item. Names that are only close are never
 * merged by the machine: they are shown to the reviewer as "looks like ...".
 */
const SPELLINGS: Record<string, string> = {
  panner: "paneer", paner: "paneer", panir: "paneer",
  chilly: "chilli", chili: "chilli", chilly_: "chilli",
  kabab: "kebab", kabob: "kebab", kebap: "kebab",
  biriyani: "biryani", briyani: "biryani", biryanee: "biryani",
  hydrabadi: "hyderabadi", hyderabadi: "hyderabadi", hyderabad: "hyderabadi",
  kolapuri: "kolhapuri", kolahpuri: "kolhapuri", kholapuri: "kolhapuri", kolhapuri: "kolhapuri",
  makhni: "makhani", makhanwala: "makhani", makkhani: "makhani",
  pakoda: "pakora", pakodi: "pakora", pakoras: "pakora",
  pulav: "pulao", pilaf: "pulao", pilau: "pulao",
  chat: "chaat",
  gobhi: "gobi", gobi: "gobi", cauliflower: "gobi",
  alu: "aloo", aaloo: "aloo", potato: "aloo",
  mutter: "matar", mattar: "matar", peas: "matar",
  daal: "dal", dhal: "dal", lentil: "dal", lentils: "dal",
  rasagulla: "rasgulla", rosogolla: "rasgulla", rasagolla: "rasgulla",
  manchuria: "manchurian", manchurion: "manchurian",
  tikki: "tikki", tiki: "tikki",
  icecream: "icecream",
  mushrooms: "mushroom", tomatoes: "tomato", potatoes: "aloo",
  gulabjamun: "gulab jamun", rasmalai: "rasmalai",
  murg: "chicken", murgh: "chicken", kukkad: "chicken",
  ghosht: "mutton", gosht: "mutton", maas: "mutton",
  kofta: "kofta", koftas: "kofta",
  masale: "masala", masalaa: "masala",
  dhaniya: "coriander", jeera: "cumin", haldi: "turmeric", lal: "red",
};

const STOP = new Set(["the", "a", "an", "with", "and", "in", "of", "style", "special", "fresh", "dry", "live", "plain"]);

/** "Paneer Butter Masala (Gravy)" -> "paneer butter masala". Brackets and punctuation are dropped, spellings unified. */
export function normalizeName(raw: string): string {
  const words = raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/&/g, " and ")
    .replace(/ice[\s-]*cream/g, "icecream")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !STOP.has(w));
  return words
    .map((w) => SPELLINGS[w] ?? (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .join(" ")
    .trim();
}

/** Words in a fixed order, so "chicken butter" and "butter chicken" meet. */
function sortedKey(normalized: string): string {
  return normalized.split(" ").sort().join(" ");
}

function distance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = tmp;
    }
  }
  return prev[b.length];
}

/** 1 = identical, 0 = nothing alike (on the word-sorted keys). */
export function similarity(a: string, b: string): number {
  const x = sortedKey(a);
  const y = sortedKey(b);
  if (!x || !y) return 0;
  return 1 - distance(x, y) / Math.max(x.length, y.length);
}

export interface LibraryEntry {
  id: string;
  name: string;
  aliases: string[];
}

export interface LibraryIndex {
  /** word-sorted normalized name or alias -> entry */
  exact: Map<string, LibraryEntry>;
  entries: { entry: LibraryEntry; key: string }[];
}

export function buildLibraryIndex(entries: LibraryEntry[]): LibraryIndex {
  const exact = new Map<string, LibraryEntry>();
  const all: LibraryIndex["entries"] = [];
  for (const entry of entries) {
    for (const label of [entry.name, ...entry.aliases]) {
      const key = normalizeName(label);
      if (!key) continue;
      exact.set(sortedKey(key), entry);
      all.push({ entry, key });
    }
  }
  return { exact, entries: all };
}

export type LibraryMatch = { kind: "exact"; entry: LibraryEntry } | { kind: "close"; entry: LibraryEntry; score: number } | { kind: "none" };

export const CLOSE_MATCH_THRESHOLD = 0.8;

/** Exact (same normalized words in any order, against names and aliases), else the closest name above the threshold, else none. */
export function findLibraryMatch(name: string, index: LibraryIndex): LibraryMatch {
  const key = normalizeName(name);
  if (!key) return { kind: "none" };
  const exact = index.exact.get(sortedKey(key));
  if (exact) return { kind: "exact", entry: exact };
  let best: { entry: LibraryEntry; score: number } | null = null;
  for (const { entry, key: other } of index.entries) {
    const score = similarity(key, other);
    // a shorter name wholly inside a longer one ("paneer tikka" in "achari paneer tikka") also counts as close
    const inside = key.split(" ").length >= 2 && other.split(" ").length >= 2 && (` ${other} `.includes(` ${key} `) || ` ${key} `.includes(` ${other} `)) ? 0.85 : 0;
    const s = Math.max(score, inside);
    if (s >= CLOSE_MATCH_THRESHOLD && (!best || s > best.score)) best = { entry, score: s };
  }
  return best ? { kind: "close", ...best } : { kind: "none" };
}

/** Names that are not worth a reviewer's time: too short, only digits, obvious test text. */
export function isJunkName(raw: string): boolean {
  const key = normalizeName(raw);
  if (key.length < 3) return true;
  if (/^[0-9 ]+$/.test(key)) return true;
  if (/\b(test|testing|asdf|qwerty|dummy|sample|demo|xxx|lorem)\b/.test(key)) return true;
  if (/(.)\1{3,}/.test(key)) return true;
  return false;
}
