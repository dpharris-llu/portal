/**
 * Slide search for the command bar (L-01) and question matching (A-05).
 * Runs locally with no network (L-10): BM25 over claim, content, notes and data
 * labels. Semantic matching (L-02) plugs in through `vectors`: when per-slide
 * embeddings and a query embedding are supplied, scores are blended.
 */
import type { Block, Deck, Id, Section } from "@/model/types";

export interface SearchDoc {
  slideId: Id;
  section: Section;
  position: number;
  fields: { text: string; weight: number }[];
}

export interface SearchHit {
  slideId: Id;
  section: Section;
  position: number;
  score: number;
  /** 0..1, relative to the best possible match for this query. */
  confidence: number;
}

export interface SearchIndex {
  docs: SearchDoc[];
  tf: Map<Id, Map<string, number>>;
  df: Map<string, number>;
  lengths: Map<Id, number>;
  avgLength: number;
}

const STOP = new Set(
  "a an and are as at be by did do does for from how i in is it its me of on or show slide the this to was we what when where which who why with you".split(" "),
);

/** Light stemmer: enough to match plurals and common suffixes. */
export function stem(word: string): string {
  let w = word;
  for (const suf of ["ingly", "edly", "ing", "ers", "ies", "ed", "es", "er", "ly", "s"]) {
    if (w.length > suf.length + 2 && w.endsWith(suf)) {
      w = w.slice(0, -suf.length) + (suf === "ies" ? "y" : "");
      break;
    }
  }
  return w;
}

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((t) => !STOP.has(t))
    .map(stem);
}

function blockText(b: Block): string {
  switch (b.type) {
    case "text":
      return b.text;
    case "bullets":
      return b.items.join(" ");
    case "quote":
      return `${b.text} ${b.attribution ?? ""}`;
    case "image":
      return `${b.alt} ${b.attribution ?? ""}`;
    case "table":
      return [b.caption ?? "", ...b.header, ...b.rows.flat()].join(" ");
    case "chart":
      return [b.alt, ...b.labels, ...b.series.map((s) => s.name)].join(" ");
    case "poll":
      return [b.question, ...b.options].join(" ");
  }
}

export function deckDocs(deck: Deck): SearchDoc[] {
  const docs: SearchDoc[] = [];
  for (const section of ["narrative", "backup"] as const) {
    deck[section].forEach((id, position) => {
      const s = deck.slides[id];
      if (!s) return;
      docs.push({
        slideId: id,
        section,
        position,
        fields: [
          { text: s.claim, weight: 3 },
          ...s.blocks.map((b) => ({ text: blockText(b), weight: 1.5 })),
          ...(s.freeform?.blocks ?? []).map((b) => ({ text: blockText(b), weight: 1 })),
          { text: s.notes, weight: 1 },
        ],
      });
    });
  }
  return docs;
}

export function buildIndex(deck: Deck): SearchIndex {
  const docs = deckDocs(deck);
  const tf = new Map<Id, Map<string, number>>();
  const df = new Map<string, number>();
  const lengths = new Map<Id, number>();
  for (const d of docs) {
    const counts = new Map<string, number>();
    let len = 0;
    for (const f of d.fields) {
      for (const t of tokenize(f.text)) {
        counts.set(t, (counts.get(t) ?? 0) + f.weight);
        len += 1;
      }
    }
    tf.set(d.slideId, counts);
    lengths.set(d.slideId, len);
    for (const t of counts.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const avgLength = docs.length ? [...lengths.values()].reduce((a, b) => a + b, 0) / docs.length : 1;
  return { docs, tf, df, lengths, avgLength: avgLength || 1 };
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export interface SearchOptions {
  limit?: number;
  /** Per-slide embeddings and the query's embedding, for semantic matching (L-02). */
  vectors?: { slides: Record<Id, number[]>; query: number[] };
}

const K1 = 1.2;
const B = 0.75;

export function search(index: SearchIndex, query: string, opts: SearchOptions = {}): SearchHit[] {
  const terms = [...new Set(tokenize(query))];
  const N = index.docs.length;
  const idf = (t: string) => {
    const n = index.df.get(t) ?? 0;
    return Math.log(1 + (N - n + 0.5) / (n + 0.5));
  };
  // Best case: every term matched in a slide of average length with weight 3.
  const best = terms.reduce((acc, t) => acc + idf(t) * ((3 * (K1 + 1)) / (3 + K1)), 0) || 1;

  const hits: SearchHit[] = [];
  for (const d of index.docs) {
    const counts = index.tf.get(d.slideId)!;
    const len = index.lengths.get(d.slideId) ?? 0;
    let lexical = 0;
    for (const t of terms) {
      let f = counts.get(t) ?? 0;
      // Prefix match for partial words typed in the command bar.
      if (!f && t.length >= 3) {
        for (const [k, v] of counts) if (k.startsWith(t)) f = Math.max(f, v * 0.7);
      }
      if (!f) continue;
      lexical += idf(t) * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * len) / index.avgLength)));
    }
    let confidence = Math.min(1, lexical / best);
    if (opts.vectors?.slides[d.slideId]) {
      const sim = Math.max(0, cosine(opts.vectors.slides[d.slideId], opts.vectors.query));
      confidence = 0.4 * confidence + 0.6 * sim;
    }
    if (confidence > 0) hits.push({ slideId: d.slideId, section: d.section, position: d.position, score: lexical, confidence });
  }
  hits.sort((a, b) => b.confidence - a.confidence || a.position - b.position);
  return hits.slice(0, opts.limit ?? 3);
}

/** Below this, a match is shown as a suggestion only (L-09). */
export const LOW_CONFIDENCE = 0.35;
