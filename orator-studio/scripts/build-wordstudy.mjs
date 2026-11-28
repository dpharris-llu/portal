#!/usr/bin/env node
/**
 * Builds the word-study data (spec F-128) from STEPBible's open data
 * (Tyndale House, Cambridge; CC BY 4.0, credit "STEP Bible", www.STEPBible.org):
 *   TAGNT  Greek New Testament, word by word (Nestle-Aland text)
 *   TAHOT  Hebrew Old Testament, word by word (Leningrad codex)
 *   TBESG / TBESH  brief Greek and Hebrew lexicons
 *
 * Writes public/wordstudy/:
 *   books/<BOOK>.json   each verse's words: [original, transliteration, English, Strong's, grammar]
 *   occ/<G03>.json      for each Strong's number, every verse it occurs in (grouped by number/100)
 *   lex/<G03>.json      for each Strong's number, word, transliteration, gloss, short definition
 *   meta.json           source, license, counts
 *
 * Usage: node scripts/build-wordstudy.mjs [dir with the downloaded .txt files]
 * Missing files are downloaded from raw.githubusercontent.com/STEPBible/STEPBible-Data.
 */
import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve(process.argv[2] ?? ".wordstudy-src");
const OUT = path.resolve("public/wordstudy");
const RAW = "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/";
const FILES = {
  greek: [
    "Translators Amalgamated OT+NT/TAGNT Mat-Jhn - Translators Amalgamated Greek NT - STEPBible.org CC-BY.txt",
    "Translators Amalgamated OT+NT/TAGNT Act-Rev - Translators Amalgamated Greek NT - STEPBible.org CC-BY.txt",
  ],
  hebrew: [
    "Translators Amalgamated OT+NT/TAHOT Gen-Deu - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt",
    "Translators Amalgamated OT+NT/TAHOT Jos-Est - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt",
    "Translators Amalgamated OT+NT/TAHOT Job-Sng - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt",
    "Translators Amalgamated OT+NT/TAHOT Isa-Mal - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt",
  ],
  lexG: "Lexicons/TBESG - Translators Brief lexicon of Extended Strongs for Greek - STEPBible.org CC BY.txt",
  lexH: "Lexicons/TBESH - Translators Brief lexicon of Extended Strongs for Hebrew - STEPBible.org CC BY.txt",
};

// USFM codes in canonical order; STEPBible's book codes are mapped in the same order.
const USFM = "GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC MAL MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV".split(" ");

async function source(rel) {
  const local = path.join(SRC, path.basename(rel));
  if (!fs.existsSync(local)) {
    fs.mkdirSync(SRC, { recursive: true });
    const url = RAW + rel.split("/").map(encodeURIComponent).join("/");
    process.stderr.write(`Downloading ${path.basename(rel)}…\n`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} for ${url}`);
    fs.writeFileSync(local, Buffer.from(await res.arrayBuffer()));
  }
  return fs.readFileSync(local, "utf8");
}

/** "Gen.31.55(32.1)#01=L" -> { book: "Gen", ch: 31, v: 55, type: "L" } (English versification). */
function ref(cell) {
  const m = /^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)(?:[([{][^)\]}]*[)\]}])*#\d+(?:=(\S+))?$/.exec(cell);
  return m ? { book: m[1], ch: Number(m[2]), v: Number(m[3]), type: m[4] ?? "" } : null;
}

/** "H0430G" / "G0373" / "G3004G" -> "H0430" / "G0373" / "G3004": the classic Strong's number. */
const base = (s) => (/^([GH])(\d{1,4})/.exec(s) ? `${s[0]}${s.slice(1).match(/^\d+/)[0].padStart(4, "0")}` : null);
const bucket = (s) => s.slice(0, 3); // "G03" for G0300-G0399

const books = new Map(); // STEP code -> { lang, verses: Map("ch:v" -> words[]) }
const order = [];
const occ = new Map(); // Strong's -> Set of "BOOK.ch.v"

function addWord(lang, r, word) {
  if (!books.has(r.book)) {
    books.set(r.book, { lang, verses: new Map() });
    order.push(r.book);
  }
  const key = `${r.ch}:${r.v}`;
  const vs = books.get(r.book).verses;
  if (!vs.has(key)) vs.set(key, []);
  vs.get(key).push(word);
}

function parseGreek(text) {
  for (const line of text.split("\n")) {
    const cols = line.split("\t");
    const r = ref(cols[0]);
    if (!r) continue;
    // N = in the Nestle-Aland text used by modern translations (n: a minor difference there).
    if (!/[Nn]/.test(r.type)) continue;
    const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(cols[1] ?? "");
    const greek = (m ? m[1] : cols[1] ?? "").trim();
    const translit = m ? m[2].trim() : "";
    const [strong, grammar = ""] = (cols[3] ?? "").split("=");
    const s = base(strong ?? "");
    addWord("greek", r, [greek, translit, (cols[2] ?? "").trim(), s ?? "", grammar.trim()]);
    if (s) addOcc(s, r);
  }
}

function parseHebrew(text) {
  for (const line of text.split("\n")) {
    const cols = line.split("\t");
    const r = ref(cols[0]);
    if (!r) continue;
    // The word's main lexical entry is the one in braces: "H9001/{H3615G}".
    const main = /\{([^}]+)\}/.exec(cols[4] ?? "")?.[1] ?? (cols[4] ?? "").split(/[/\\]/).find((x) => !/^H9\d{3}/.test(x)) ?? "";
    const s = base(main);
    addWord("hebrew", r, [(cols[1] ?? "").replace(/[/\\]/g, "").trim(), (cols[2] ?? "").replace(/[/\\]/g, "").trim(), (cols[3] ?? "").replace(/\/\s*/g, " ").replace(/\s+/g, " ").trim(), s ?? "", (cols[5] ?? "").trim()]);
    if (s) addOcc(s, r);
  }
}

const usfmOf = new Map();
function addOcc(s, r) {
  if (!occ.has(s)) occ.set(s, new Set());
  occ.get(s).add(`${r.book}|${r.ch}.${r.v}`);
}

/** Brief lexicon: classic Strong's -> { w, t, g, d } (first entry wins; extended letters share one number). */
function parseLexicon(text, into) {
  for (const line of text.split("\n")) {
    const cols = line.split("\t");
    if (!/^[GH]\d{4}[A-Za-z]?$/.test(cols[0] ?? "")) continue;
    const s = base(cols[0]);
    if (!s || into[s]) continue;
    const def = (cols[7] ?? "")
      .replace(/<br\s*\/?>/gi, "; ")
      .replace(/<[^>]+>/g, "")
      .replace(/\s*;\s*(;\s*)+/g, "; ")
      .replace(/\s+/g, " ")
      .replace(/^[;\s]+|[;\s]+$/g, "")
      .trim();
    into[s] = { w: (cols[3] ?? "").trim(), t: (cols[4] ?? "").trim(), g: (cols[6] ?? "").trim(), d: def.length > 700 ? def.slice(0, 697) + "…" : def };
  }
}

const write = (rel, obj) => {
  const f = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(obj));
};

for (const f of FILES.hebrew) parseHebrew(await source(f));
for (const f of FILES.greek) parseGreek(await source(f));
const lex = {};
parseLexicon(await source(FILES.lexH), lex);
parseLexicon(await source(FILES.lexG), lex);

if (order.length !== 66) throw new Error(`Expected 66 books, found ${order.length}: ${order.join(" ")}`);
order.forEach((b, i) => usfmOf.set(b, USFM[i]));

fs.rmSync(OUT, { recursive: true, force: true });
let words = 0;
for (const [b, { lang, verses }] of books) {
  const v = Object.fromEntries(verses);
  words += [...verses.values()].reduce((n, w) => n + w.length, 0);
  write(`books/${usfmOf.get(b)}.json`, { book: usfmOf.get(b), lang, verses: v });
}
const occBuckets = {};
for (const [s, set] of occ) {
  const refs = [...set].map((x) => {
    const [b, cv] = x.split("|");
    return `${usfmOf.get(b)}.${cv}`;
  });
  (occBuckets[bucket(s)] ??= {})[s] = refs;
}
for (const [k, v] of Object.entries(occBuckets)) write(`occ/${k}.json`, v);
const lexBuckets = {};
for (const [s, e] of Object.entries(lex)) (lexBuckets[bucket(s)] ??= {})[s] = e;
for (const [k, v] of Object.entries(lexBuckets)) write(`lex/${k}.json`, v);
write("meta.json", {
  source: "STEPBible data (Tyndale House, Cambridge): TAGNT, TAHOT, TBESG, TBESH",
  license: "CC BY 4.0",
  credit: "STEP Bible",
  creditUrl: "https://www.STEPBible.org",
  builtAt: new Date().toISOString().slice(0, 10),
  books: order.length,
  words,
  strongs: occ.size,
});
process.stderr.write(`Wrote ${order.length} books, ${words.toLocaleString()} words, ${occ.size.toLocaleString()} Strong's numbers to ${OUT}\n`);
