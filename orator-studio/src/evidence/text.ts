/**
 * Text of research papers for Claude to read, and the checks that keep its
 * quotes honest. Papers are usually set in two columns, so a page is read
 * column by column (full-width title and abstract first), lines broken by
 * hyphenation are rejoined, and page numbers are kept for citations.
 */
import { lines, type PageText, type TextItem } from "@/documents/extract";

export interface PaperPage {
  page: number;
  text: string;
}

function joinLines(items: TextItem[]): string[] {
  return lines({ page: 0, items }).map((segs) => segs.map((s) => s.text).join(" "));
}

/** One page's text in reading order, handling a two-column layout. */
export function pageText(page: PageText): string {
  const items = page.items.filter((i) => i.str.trim());
  if (!items.length) return "";
  const right = Math.max(...items.map((i) => i.x + i.width));
  const left0 = Math.min(...items.map((i) => i.x));
  const mid = left0 + (right - left0) / 2;
  const leftCol = items.filter((i) => i.x + i.width < mid - 4);
  const rightCol = items.filter((i) => i.x > mid + 4);
  const spanning = items.filter((i) => !leftCol.includes(i) && !rightCol.includes(i));
  const twoColumns = leftCol.length >= 8 && rightCol.length >= 8 && spanning.length <= 0.15 * (leftCol.length + rightCol.length);
  if (!twoColumns) return dehyphenate(joinLines(items));
  const colTop = Math.max(...[...leftCol, ...rightCol].map((i) => i.y));
  const colBottom = Math.min(...[...leftCol, ...rightCol].map((i) => i.y));
  const above = spanning.filter((i) => i.y > colTop);
  const below = spanning.filter((i) => i.y < colBottom);
  const within = spanning.filter((i) => i.y <= colTop && i.y >= colBottom);
  // Items that cross the gutter inside the columns (rare: a figure caption) stay with the column they start in.
  const leftAll = [...leftCol, ...within.filter((i) => i.x < mid)];
  const rightAll = [...rightCol, ...within.filter((i) => i.x >= mid)];
  return dehyphenate([...joinLines(above), ...joinLines(leftAll), ...joinLines(rightAll), ...joinLines(below)]);
}

/** Rejoin words split across lines ("treat-" + "ment"). */
function dehyphenate(ls: string[]): string {
  const out: string[] = [];
  for (const line of ls) {
    const prev = out[out.length - 1];
    if (prev && /[a-z]-$/.test(prev) && /^[a-z]/.test(line)) out[out.length - 1] = prev.slice(0, -1) + line;
    else out.push(line);
  }
  return out.join("\n");
}

export function paperPages(pages: PageText[]): PaperPage[] {
  return pages.map((p) => ({ page: p.page, text: pageText(p) }));
}

/**
 * The text Claude reads: page markers kept, the reference list left out (it is
 * long and holds no findings), and cut to a size limit if needed.
 */
export function paperForClaude(pages: PaperPage[], maxChars = 150_000): { text: string; truncated: boolean; referencesFrom?: number } {
  let refPage: number | undefined;
  const parts: string[] = [];
  for (const p of pages) {
    let t = p.text;
    // The reference list starts in the later part of a paper (from page 2 of a short one).
    if (refPage === undefined && p.page >= Math.min(pages.length, Math.max(2, Math.ceil(pages.length * 0.4)))) {
      const m = t.match(/^\s*(references|bibliography|works cited|literature cited)\s*$/im);
      if (m && m.index !== undefined) {
        refPage = p.page;
        t = t.slice(0, m.index);
      }
    } else if (refPage !== undefined) continue;
    parts.push(`[[Page ${p.page}]]\n${t.trim()}`);
  }
  let text = parts.join("\n\n");
  const truncated = text.length > maxChars;
  if (truncated) text = text.slice(0, maxChars) + "\n[[The rest of the paper was cut for length.]]";
  return { text, truncated, ...(refPage ? { referencesFrom: refPage } : {}) };
}

// ---- Checking quotes and numbers against the page ----

/** Normalize for comparison: ligatures, quotes, dashes, hyphenation, spacing, case, thousands separators. */
export function normalize(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/·/g, ".") // Lancet-style decimal points
    .replace(/([a-z])-\s*\n\s*([a-z])/gi, "$1$2")
    .replace(/(\d),(\d{3})/g, "$1$2")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

/** A quote is found when it appears on the page word for word; "..." may skip text between parts, in order. */
export function quoteFound(quote: string, page: string): boolean {
  const hay = normalize(page);
  const parts = quote
    .split(/\s*(?:\.\.\.|…|\[\.\.\.\])\s*/)
    .map((p) => normalize(p).replace(/^["'\s]+|["'\s]+$/g, ""))
    .filter((p) => p.length > 0);
  if (!parts.length) return false;
  let from = 0;
  for (const part of parts) {
    const at = hay.indexOf(part, from);
    if (at < 0) return false;
    from = at + part.length;
  }
  return true;
}

/** Numbers written in a sentence, such as 1,204, 0.82, 95%, 0.70-0.95 (each end), p<0.001. */
export function numbersInText(text: string): string[] {
  return normalize(text).match(/\d+(?:\.\d+)?/g) ?? [];
}

/** Every number in `text` that is not printed on any of the pages. */
export function numbersNotOn(text: string, pages: string[]): string[] {
  const hay = pages.map(normalize).join(" ");
  const printed = new Set(hay.match(/\d+(?:\.\d+)?/g) ?? []);
  return [...new Set(numbersInText(text))].filter((n) => !printed.has(n));
}
