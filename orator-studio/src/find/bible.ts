/**
 * Bible passages (F-123) through API.Bible (American Bible Society): NIV,
 * NKJV and NLT under API.Bible's non-commercial license, and the public-domain
 * KJV. Pure parts here (references, choosing a Bible, reading a response);
 * the server calls are in bible-server.ts.
 *
 * The Passion Translation has no API: the author enters it, labeled as a
 * paraphrase (spec 10, Scripture and faith tradition).
 */

export const API_BIBLE_BASE = "https://rest.api.bible/v1";

export type Version = "NIV" | "NKJV" | "NLT" | "KJV";
export const VERSIONS: { id: Version; name: string; licensed: boolean }[] = [
  { id: "NIV", name: "New International Version", licensed: true },
  { id: "NKJV", name: "New King James Version", licensed: true },
  { id: "NLT", name: "New Living Translation", licensed: true },
  { id: "KJV", name: "King James Version (public domain)", licensed: false },
];

/** USFM book codes, with the names and abbreviations people type. */
const BOOKS: [string, string, string[]][] = [
  ["GEN", "Genesis", ["gen", "ge", "gn"]],
  ["EXO", "Exodus", ["exod", "exo", "ex"]],
  ["LEV", "Leviticus", ["lev", "le", "lv"]],
  ["NUM", "Numbers", ["num", "nu", "nm"]],
  ["DEU", "Deuteronomy", ["deut", "deu", "dt"]],
  ["JOS", "Joshua", ["josh", "jos"]],
  ["JDG", "Judges", ["judg", "jdg", "jg"]],
  ["RUT", "Ruth", ["ru", "rth"]],
  ["1SA", "1 Samuel", ["1 sam", "1 sa", "1sam"]],
  ["2SA", "2 Samuel", ["2 sam", "2 sa", "2sam"]],
  ["1KI", "1 Kings", ["1 kgs", "1 ki", "1kgs"]],
  ["2KI", "2 Kings", ["2 kgs", "2 ki", "2kgs"]],
  ["1CH", "1 Chronicles", ["1 chron", "1 chr", "1 ch"]],
  ["2CH", "2 Chronicles", ["2 chron", "2 chr", "2 ch"]],
  ["EZR", "Ezra", ["ezr"]],
  ["NEH", "Nehemiah", ["neh", "ne"]],
  ["EST", "Esther", ["esth", "est"]],
  ["JOB", "Job", ["jb"]],
  ["PSA", "Psalms", ["psalm", "ps", "psa", "pss"]],
  ["PRO", "Proverbs", ["prov", "pro", "prv", "pr"]],
  ["ECC", "Ecclesiastes", ["eccl", "ecc", "eccles", "qoh"]],
  ["SNG", "Song of Songs", ["song of solomon", "song", "sos", "canticles"]],
  ["ISA", "Isaiah", ["isa", "is"]],
  ["JER", "Jeremiah", ["jer", "je"]],
  ["LAM", "Lamentations", ["lam", "la"]],
  ["EZK", "Ezekiel", ["ezek", "eze", "ezk"]],
  ["DAN", "Daniel", ["dan", "da", "dn"]],
  ["HOS", "Hosea", ["hos", "ho"]],
  ["JOL", "Joel", ["jl"]],
  ["AMO", "Amos", ["am"]],
  ["OBA", "Obadiah", ["obad", "ob"]],
  ["JON", "Jonah", ["jnh", "jon"]],
  ["MIC", "Micah", ["mic", "mi"]],
  ["NAM", "Nahum", ["nah", "na"]],
  ["HAB", "Habakkuk", ["hab", "hb"]],
  ["ZEP", "Zephaniah", ["zeph", "zep", "zp"]],
  ["HAG", "Haggai", ["hag", "hg"]],
  ["ZEC", "Zechariah", ["zech", "zec", "zc"]],
  ["MAL", "Malachi", ["mal", "ml"]],
  ["MAT", "Matthew", ["matt", "mat", "mt"]],
  ["MRK", "Mark", ["mrk", "mk", "mr"]],
  ["LUK", "Luke", ["luk", "lk"]],
  ["JHN", "John", ["jn", "jhn", "joh"]],
  ["ACT", "Acts", ["act", "ac"]],
  ["ROM", "Romans", ["rom", "ro", "rm"]],
  ["1CO", "1 Corinthians", ["1 cor", "1 co", "1cor"]],
  ["2CO", "2 Corinthians", ["2 cor", "2 co", "2cor"]],
  ["GAL", "Galatians", ["gal", "ga"]],
  ["EPH", "Ephesians", ["eph", "ephes"]],
  ["PHP", "Philippians", ["phil", "php", "pp"]],
  ["COL", "Colossians", ["col"]],
  ["1TH", "1 Thessalonians", ["1 thess", "1 th", "1thess"]],
  ["2TH", "2 Thessalonians", ["2 thess", "2 th", "2thess"]],
  ["1TI", "1 Timothy", ["1 tim", "1 ti", "1tim"]],
  ["2TI", "2 Timothy", ["2 tim", "2 ti", "2tim"]],
  ["TIT", "Titus", ["tit", "ti"]],
  ["PHM", "Philemon", ["philem", "phm", "pm"]],
  ["HEB", "Hebrews", ["heb"]],
  ["JAS", "James", ["jas", "jm"]],
  ["1PE", "1 Peter", ["1 pet", "1 pe", "1pet"]],
  ["2PE", "2 Peter", ["2 pet", "2 pe", "2pet"]],
  ["1JN", "1 John", ["1 jn", "1 jo", "1jn", "1 jhn"]],
  ["2JN", "2 John", ["2 jn", "2 jo", "2jn", "2 jhn"]],
  ["3JN", "3 John", ["3 jn", "3 jo", "3jn", "3 jhn"]],
  ["JUD", "Jude", ["jud", "jd"]],
  ["REV", "Revelation", ["rev", "re", "revelations", "apocalypse"]],
];

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/^(i{1,3})\s+/, (_, r: string) => `${r.length} `)
    .replace(/^(first|second|third)\s+/, (_, w: string) => `${{ first: 1, second: 2, third: 3 }[w as "first"]} `)
    .replace(/^(\d)\s*/, "$1 ")
    .replace(/\s+/g, " ")
    .trim();

const BOOK_INDEX = new Map<string, { code: string; name: string }>();
for (const [code, name, abbr] of BOOKS) for (const k of [name, ...abbr]) BOOK_INDEX.set(norm(k), { code, name });

export type Reference = {
  code: string;
  book: string;
  chapter: number;
  verse?: number;
  endChapter?: number;
  endVerse?: number;
};

/**
 * "John 3:16", "Jn 3:16-18", "1 Cor 13:4–7", "Ps 23", "Romans 8:38–9:2",
 * "Song of Songs 2:1". Null when it isn't a reference.
 */
export function parseReference(input: string): Reference | null {
  const m = /^\s*((?:[1-3]|i{1,3}|first|second|third)?\s*[a-z][a-z. ]*?)\s*(\d{1,3})(?:\s*[:.]\s*(\d{1,3}))?(?:\s*[-–—]\s*(\d{1,3})(?:\s*[:.]\s*(\d{1,3}))?)?\s*$/i.exec(input);
  if (!m) return null;
  const book = BOOK_INDEX.get(norm(m[1]));
  if (!book) return null;
  const chapter = Number(m[2]);
  const verse = m[3] ? Number(m[3]) : undefined;
  let endChapter: number | undefined;
  let endVerse: number | undefined;
  if (m[4]) {
    if (m[5]) {
      endChapter = Number(m[4]);
      endVerse = Number(m[5]);
    } else if (verse !== undefined) endVerse = Number(m[4]);
    else endChapter = Number(m[4]);
  }
  if (verse === undefined && endVerse !== undefined) return null;
  return { code: book.code, book: book.name, chapter, ...(verse !== undefined ? { verse } : {}), ...(endChapter !== undefined ? { endChapter } : {}), ...(endVerse !== undefined ? { endVerse } : {}) };
}

/**
 * API.Bible's id for a reference: a passage ("JHN.3.16-JHN.3.18") or a whole
 * chapter ("PSA.23"). A range of whole chapters isn't supported: null.
 */
export function apiId(r: Reference): { kind: "passage" | "chapter"; id: string } | null {
  if (r.verse === undefined && r.endChapter !== undefined) return null;
  if (r.verse === undefined && r.endChapter === undefined) return { kind: "chapter", id: `${r.code}.${r.chapter}` };
  const start = `${r.code}.${r.chapter}.${r.verse}`;
  if (r.endVerse === undefined) return { kind: "passage", id: start };
  return { kind: "passage", id: `${start}-${r.code}.${r.endChapter ?? r.chapter}.${r.endVerse}` };
}

/** "John 3:16–18", "Psalms 23", "Romans 8:38–9:2". */
export function formatReference(r: Reference): string {
  let s = `${r.book} ${r.chapter}`;
  if (r.verse !== undefined) s += `:${r.verse}`;
  if (r.endChapter !== undefined && r.endVerse !== undefined) s += `–${r.endChapter}:${r.endVerse}`;
  else if (r.endChapter !== undefined) s += `–${r.endChapter}`;
  else if (r.endVerse !== undefined) s += `–${r.endVerse}`;
  return s;
}

type BibleRow = { id: string; abbreviation?: string; abbreviationLocal?: string; name?: string; language?: { id?: string } };

const NOT_MAIN = /anglici|reader|listener|audio|catholic|study|youth|kids|large print|edition/i;
const WANT: Record<Version, { abbr: string[]; name: RegExp; known?: string }> = {
  NIV: { abbr: ["NIV11", "NIV"], name: /^new international version/i, known: "78a9f6124f344018-01" },
  NKJV: { abbr: ["NKJV"], name: /^new king james/i },
  NLT: { abbr: ["NLT"], name: /^new living translation/i },
  KJV: { abbr: ["ENGKJV", "KJV"], name: /^king james/i, known: "de4e12af7f28f599-01" },
};

/** The Bible id for a version among those this account can use, or null. */
export function pickBible(rows: BibleRow[], v: Version): string | null {
  const want = WANT[v];
  const english = rows.filter((r) => !r.language?.id || r.language.id === "eng");
  if (want.known && english.some((r) => r.id === want.known)) return want.known;
  const byAbbr = english.filter((r) => want.abbr.includes((r.abbreviation ?? r.abbreviationLocal ?? "").toUpperCase()) && !NOT_MAIN.test(r.name ?? ""));
  if (byAbbr.length) return byAbbr[0].id;
  const byName = english.filter((r) => want.name.test(r.name ?? "") && !NOT_MAIN.test(r.name ?? ""));
  return byName[0]?.id ?? null;
}

export type Passage = {
  version: Version;
  bibleId: string;
  apiId: string;
  reference: string;
  text: string;
  copyright: string;
  fumsToken?: string;
};

/** A passage or chapter response, as plain text. */
export function readPassage(json: unknown, version: Version, bibleId: string, fallbackRef: string): Passage {
  const d = (json as { data?: { id?: string; reference?: string; content?: string; copyright?: string }; meta?: { fumsToken?: string } }) ?? {};
  const text = (d.data?.content ?? "")
    .replace(/¶/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return {
    version,
    bibleId,
    apiId: d.data?.id ?? "",
    reference: d.data?.reference || fallbackRef,
    text,
    copyright: (d.data?.copyright ?? "").replace(/\s+/g, " ").trim(),
    ...(d.meta?.fumsToken ? { fumsToken: d.meta.fumsToken } : {}),
  };
}

/** Scripture kept in a presentation must be fetched again at least every 30 days (API.Bible terms). */
export const REFRESH_DAYS = 28;
export const needsRefresh = (fetchedAt: string | undefined, now = Date.now()) => !fetchedAt || now - new Date(fetchedAt).getTime() > REFRESH_DAYS * 86_400_000;

export const TPT_NOTICE =
  "Scripture quotations marked TPT are taken from The Passion Translation®. Copyright © 2017, 2018, 2020 by Passion & Fire Ministries, Inc. Used by permission. All rights reserved. ThePassionTranslation.com.";

export type VerseHit = { reference: string; text: string };

/** A word search's verses (API.Bible /search), as plain text. */
export function readSearch(json: unknown): { verses: VerseHit[]; total: number; fumsToken?: string } {
  const d = (json as { data?: { total?: number; verses?: { reference?: string; text?: string }[] }; meta?: { fumsToken?: string } }) ?? {};
  const verses = (d.data?.verses ?? [])
    .map((v) => ({ reference: (v.reference ?? "").trim(), text: (v.text ?? "").replace(/\s+/g, " ").trim() }))
    .filter((v) => v.reference && v.text);
  return { verses, total: d.data?.total ?? verses.length, ...(d.meta?.fumsToken ? { fumsToken: d.meta.fumsToken } : {}) };
}
