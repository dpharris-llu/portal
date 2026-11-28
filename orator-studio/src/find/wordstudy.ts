/**
 * Word study (F-128): the Greek and Hebrew behind each verse, and every place
 * a word occurs, from STEPBible's open data (Tyndale House, Cambridge; CC BY
 * 4.0). The data is built by scripts/build-wordstudy.mjs into static files
 * under /wordstudy, so reading it costs nothing and needs no key.
 */

/** One word: [original, transliteration, English, Strong's, grammar]. */
export type Word = [string, string, string, string, string];
export type BookData = { book: string; lang: "greek" | "hebrew"; verses: Record<string, Word[]> };
export type LexEntry = { w: string; t: string; g: string; d: string };

export const CREDIT = "Greek and Hebrew data: STEP Bible (www.STEPBible.org), Tyndale House, Cambridge, CC BY 4.0";

const bucket = (strong: string) => strong.slice(0, 3);
const cache = new Map<string, Promise<unknown>>();
function load<T>(url: string): Promise<T> {
  if (!cache.has(url))
    cache.set(
      url,
      fetch(url).then((r) => {
        if (!r.ok) throw new Error("The word-study data couldn't be loaded.");
        return r.json();
      }),
    );
  return cache.get(url) as Promise<T>;
}

export const loadBook = (code: string) => load<BookData>(`/wordstudy/books/${code}.json`);
export async function lexicon(strong: string): Promise<LexEntry | null> {
  return (await load<Record<string, LexEntry>>(`/wordstudy/lex/${bucket(strong)}.json`).catch(() => ({}) as Record<string, LexEntry>))[strong] ?? null;
}
export async function occurrences(strong: string): Promise<string[]> {
  return (await load<Record<string, string[]>>(`/wordstudy/occ/${bucket(strong)}.json`).catch(() => ({}) as Record<string, string[]>))[strong] ?? [];
}

/** Occurrences counted by book, in canonical order: [["MAT", 4], ["MRK", 3], ...]. */
export function byBook(refs: string[]): [string, number][] {
  const out: [string, number][] = [];
  for (const r of refs) {
    const b = r.split(".")[0];
    if (out.length && out[out.length - 1][0] === b) out[out.length - 1][1]++;
    else out.push([b, 1]);
  }
  return out;
}

/** "MRK.2.27" -> the reference to look up, using the book's English name: "Mark 2:27". */
export function refToText(ref: string, bookName: (code: string) => string): string {
  const [b, c, v] = ref.split(".");
  return Number(v) === 0 ? `${bookName(b)} ${c}` : `${bookName(b)} ${c}:${v}`;
}

/** Function words (articles, conjunctions, Hebrew prefixes) aren't worth a study. */
export const isFunctionWord = (strong: string) => /^H9\d{3}$/.test(strong) || ["G3588", "G2532", "G1161", "G0846", "G1722", "G1519", "G3756", "G1063", "G3754", "H0853", "H0834", "H3588", "H5921", "H0413"].includes(strong);
